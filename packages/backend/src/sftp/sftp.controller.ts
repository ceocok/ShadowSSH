import { Request, Response } from 'express';
import path from 'path';
import { clientStates } from '../websocket';
import { SFTPWrapper, Stats } from 'ssh2';
import { WebSocket } from 'ws';
import { ClientState, AuthenticatedWebSocket } from '../websocket/types';
import { SftpCompressRequestPayload, SftpDecompressRequestPayload, SftpCompressSuccessPayload, SftpCompressErrorPayload, SftpDecompressSuccessPayload, SftpDecompressErrorPayload } from '../websocket/types'; // Import payload types
// --- WebSocket Message Handlers (to be called by WebSocket router) ---

/**
 * 发送通用 WebSocket 错误消息的辅助函数
 */
const sendWebSocketError = (ws: AuthenticatedWebSocket | undefined, type: string, message: string, requestId: string, details?: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload: { error: message, details, requestId } }));
    } else {
        console.warn(`WebSocket closed or invalid, cannot send error for request ${requestId}. Type: ${type}, Message: ${message}`);
    }
};

/**
 * 发送压缩错误消息
 */
const sendCompressError = (ws: AuthenticatedWebSocket | undefined, error: string, requestId: string, details?: string) => {
    const payload: SftpCompressErrorPayload = { error, requestId };
    if (details) payload.details = details;
    sendWebSocketError(ws, 'sftp:compress:error', error, requestId, payload);
};

/**
 * 发送解压错误消息
 */
const sendDecompressError = (ws: AuthenticatedWebSocket | undefined, error: string, requestId: string, details?: string) => {
     const payload: SftpDecompressErrorPayload = { error, requestId };
     if (details) payload.details = details;
    sendWebSocketError(ws, 'sftp:decompress:error', error, requestId, payload);
};


/**
 * 检查 stderr 输出是否包含表示错误的常见模式 (从 SftpService 复制过来)
 */
const isErrorInStdErr = (stderr: string): boolean => {
    if (!stderr || stderr.trim().length === 0) {
        return false; // 空 stderr 不是错误
    }
    const lowerStderr = stderr.toLowerCase();
    // 常见的错误关键词或模式
    const errorPatterns = [
        'error', 'fail', 'cannot', 'not found', 'no such file', 'permission denied', 'invalid', '不支持'
    ];
    // tar/zip 进度信息通常包含百分比或文件名，不应视为错误
    if (/[\d.]+%/.test(stderr) || /adding:/.test(lowerStderr) || /inflating:/.test(lowerStderr) || /extracting:/.test(lowerStderr)) {
        // 忽略一些明确的非错误输出
        if (errorPatterns.some(pattern => lowerStderr.includes(pattern))) {
             // 如果进度信息中包含错误关键词，则可能真的是错误
             return true;
        }
        return false;
    }

    return errorPatterns.some(pattern => lowerStderr.includes(pattern));
};


/**
 * 处理 'sftp:compress' WebSocket 消息
 * @param ws WebSocket 连接实例
 * @param payload 消息负载
 */
export const handleCompressRequest = async (ws: AuthenticatedWebSocket, payload: SftpCompressRequestPayload): Promise<void> => {
    const { sources, destinationArchiveName, format, targetDirectory, requestId } = payload;
    const sessionId = ws.sessionId; // 从 AuthenticatedWebSocket 获取 sessionId

    if (!sessionId) {
        console.error(`[WS SFTP Compress] Missing sessionId on WebSocket for request (ID: ${requestId}).`);
        sendCompressError(ws, '内部错误：缺少会话 ID', requestId);
        return;
    }


    const state = clientStates.get(sessionId);

    console.log(`[WS SFTP Compress ${sessionId}] Received request (ID: ${requestId}).`);

    if (!state || !state.sshClient) {
        console.warn(`[WS SFTP Compress ${sessionId}] SSH client not ready (ID: ${requestId})`);
        sendCompressError(ws, 'SSH 会话未就绪', requestId);
        return;
    }

    console.debug(`[WS SFTP Compress ${sessionId}] Processing compress request (ID: ${requestId}). Sources: ${sources.join(', ')}, Dest: ${destinationArchiveName}, Format: ${format}, Dir: ${targetDirectory}`);

    // 构建目标压缩包的完整路径 (使用 posix 风格)
    const destinationArchivePath = path.posix.join(targetDirectory, destinationArchiveName);

    // --- 构建 Shell 命令 ---
    let command: string;
    // 确保源路径被正确引用，特别是包含空格或特殊字符时
    // 注意：源路径是相对于 targetDirectory 的
    const quotedSources = sources.map((s: string) => `"${s.replace(/"/g, '\\"')}"`).join(' ');
    // 确保目标目录和压缩包名称被正确引用
    const quotedTargetDir = `"${targetDirectory.replace(/"/g, '\\"')}"`;
    const quotedDestName = `"${destinationArchiveName.replace(/"/g, '\\"')}"`;

    const cdCommand = `cd ${quotedTargetDir}`;

    switch (format) {
        case 'zip':
            // zip -r [归档名] [源文件/目录列表]
            command = `${cdCommand} && zip -qr ${quotedDestName} ${quotedSources}`; // -q for quiet to reduce stderr noise
            break;
        case 'targz':
            // tar -czvf [归档名] [源文件/目录列表]
            command = `${cdCommand} && tar -czf ${quotedDestName} ${quotedSources}`; // removed -v for less noise
            break;
        case 'tarbz2':
            // tar -cjvf [归档名] [源文件/目录列表]
            command = `${cdCommand} && tar -cjf ${quotedDestName} ${quotedSources}`; // removed -v for less noise
            break;
        default:
            sendCompressError(ws, `不支持的压缩格式: ${format}`, requestId);
            return;
    }

    console.log(`[WS SFTP Compress ${sessionId}] Executing command: ${command} (ID: ${requestId})`);

    // --- 执行命令 ---
    try {
        state.sshClient.exec(command, (err, stream) => {
            if (err) {
                console.error(`[WS SFTP Compress ${sessionId}] Failed to start exec (ID: ${requestId}):`, err);
                sendCompressError(ws, `执行压缩命令失败: ${err.message}`, requestId);
                return;
            }

            let stderrData = '';
            let stdoutData = ''; // Capture stdout for debugging if needed
            let exitCode: number | null = null;

            stream.on('data', (data: Buffer) => {
                stdoutData += data.toString();
                // console.debug(`[WS SFTP Compress ${sessionId}] stdout: ${data}`);
            });
            stream.stderr.on('data', (data: Buffer) => {
                stderrData += data.toString();
                 console.debug(`[WS SFTP Compress ${sessionId}] stderr: ${data}`); // Log stderr for debugging
            });

            stream.on('close', (code: number | null) => {
                exitCode = code;
                console.log(`[WS SFTP Compress ${sessionId}] Command finished with code ${exitCode} (ID: ${requestId}). Stderr length: ${stderrData.length}`);
                if (exitCode === 0 && !isErrorInStdErr(stderrData)) {
                    console.log(`[WS SFTP Compress ${sessionId}] Compression successful (ID: ${requestId}).`);
                    const successPayload: SftpCompressSuccessPayload = {
                        message: '压缩成功',
                        requestId: requestId,
                        // Optionally add archive path or details here
                        // archivePath: destinationArchivePath
                    };
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'sftp:compress:success', payload: successPayload }));
                    }
                } else {
                    const errorDetails = stderrData.trim() || `压缩命令退出，代码: ${exitCode ?? 'N/A'}`;
                    console.error(`[WS SFTP Compress ${sessionId}] Compression failed (ID: ${requestId}): ${errorDetails}`);
                    sendCompressError(ws, '压缩失败', requestId, errorDetails);
                }
            });

             stream.on('error', (streamErr: Error) => {
                 console.error(`[WS SFTP Compress ${sessionId}] Command stream error (ID: ${requestId}):`, streamErr);
                 // Avoid sending duplicate errors if 'close' already indicated failure
                 if (exitCode === null) {
                    sendCompressError(ws, '压缩命令流错误', requestId, streamErr.message);
                 }
             });
        });
    } catch (execError: any) {
        console.error(`[WS SFTP Compress ${sessionId}] Unexpected error setting up exec (ID: ${requestId}):`, execError);
        sendCompressError(ws, `执行压缩时发生意外错误: ${execError.message}`, requestId);
    }
};

/**
 * 处理 'sftp:decompress' WebSocket 消息
 * @param ws WebSocket 连接实例
 * @param payload 消息负载
 */
export const handleDecompressRequest = async (ws: AuthenticatedWebSocket, payload: SftpDecompressRequestPayload): Promise<void> => {
    const { archivePath, requestId } = payload;
    const sessionId = ws.sessionId;

    if (!sessionId) {
        console.error(`[WS SFTP Decompress] Missing sessionId on WebSocket for request (ID: ${requestId}).`);
        sendDecompressError(ws, '内部错误：缺少会话 ID', requestId);
        return;
    }


    const state = clientStates.get(sessionId);

    console.log(`[WS SFTP Decompress ${sessionId}] Received request for ${archivePath} (ID: ${requestId}).`);

    if (!state || !state.sshClient) {
        console.warn(`[WS SFTP Decompress ${sessionId}] SSH client not ready (ID: ${requestId})`);
        sendDecompressError(ws, 'SSH 会话未就绪', requestId);
        return;
    }

    console.debug(`[WS SFTP Decompress ${sessionId}] Processing decompress request for ${archivePath} (ID: ${requestId})`);

    const extractDir = path.posix.dirname(archivePath);
    const archiveBasename = path.posix.basename(archivePath);

    // --- 构建 Shell 命令 ---
    let command: string;
    // 确保路径被正确引用
    const quotedExtractDir = `"${extractDir.replace(/"/g, '\\"')}"`;
    const quotedArchiveBasename = `"${archiveBasename.replace(/"/g, '\\"')}"`;

    const cdCommand = `cd ${quotedExtractDir}`;

    const lowerArchivePath = archivePath.toLowerCase();

    if (lowerArchivePath.endsWith('.zip')) {
        // unzip -o [压缩包名]
        command = `${cdCommand} && unzip -oq ${quotedArchiveBasename}`; // -o: overwrite, -q: quiet
    } else if (lowerArchivePath.endsWith('.tar.gz') || lowerArchivePath.endsWith('.tgz')) {
        // tar -xzvf [压缩包名]
        command = `${cdCommand} && tar -xzf ${quotedArchiveBasename}`; // removed -v
    } else if (lowerArchivePath.endsWith('.tar.bz2') || lowerArchivePath.endsWith('.tbz2')) {
        // tar -xjvf [压缩包名]
        command = `${cdCommand} && tar -xjf ${quotedArchiveBasename}`; // removed -v
    } else {
        sendDecompressError(ws, `不支持的压缩文件格式: ${archivePath}`, requestId);
        return;
    }

    console.log(`[WS SFTP Decompress ${sessionId}] Executing command: ${command} (ID: ${requestId})`);

    // --- 执行命令 ---
    try {
        state.sshClient.exec(command, (err, stream) => {
            if (err) {
                console.error(`[WS SFTP Decompress ${sessionId}] Failed to start exec (ID: ${requestId}):`, err);
                sendDecompressError(ws, `执行解压命令失败: ${err.message}`, requestId);
                return;
            }

            let stderrData = '';
            let stdoutData = '';
            let exitCode: number | null = null;

             stream.on('data', (data: Buffer) => {
                stdoutData += data.toString();
                // console.debug(`[WS SFTP Decompress ${sessionId}] stdout: ${data}`);
            });
            stream.stderr.on('data', (data: Buffer) => {
                stderrData += data.toString();
                 console.debug(`[WS SFTP Decompress ${sessionId}] stderr: ${data}`); // Log stderr
            });

            stream.on('close', (code: number | null) => {
                exitCode = code;
                console.log(`[WS SFTP Decompress ${sessionId}] Command finished with code ${exitCode} (ID: ${requestId}). Stderr length: ${stderrData.length}`);
                if (exitCode === 0 && !isErrorInStdErr(stderrData)) {
                    console.log(`[WS SFTP Decompress ${sessionId}] Decompression successful (ID: ${requestId}).`);
                    const successPayload: SftpDecompressSuccessPayload = {
                        message: '解压成功',
                        requestId: requestId,
                        // Optionally add target directory
                        // targetDirectory: extractDir
                    };
                     if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'sftp:decompress:success', payload: successPayload }));
                     }
                } else {
                    const errorDetails = stderrData.trim() || `解压命令退出，代码: ${exitCode ?? 'N/A'}`;
                    console.error(`[WS SFTP Decompress ${sessionId}] Decompression failed (ID: ${requestId}): ${errorDetails}`);
                    sendDecompressError(ws, '解压失败', requestId, errorDetails);
                }
            });

             stream.on('error', (streamErr: Error) => {
                 console.error(`[WS SFTP Decompress ${sessionId}] Command stream error (ID: ${requestId}):`, streamErr);
                 if (exitCode === null) {
                    sendDecompressError(ws, '解压命令流错误', requestId, streamErr.message);
                 }
             });
        });
    } catch (execError: any) {
        console.error(`[WS SFTP Decompress ${sessionId}] Unexpected error setting up exec (ID: ${requestId}):`, execError);
        sendDecompressError(ws, `执行解压时发生意外错误: ${execError.message}`, requestId);
    }
};
