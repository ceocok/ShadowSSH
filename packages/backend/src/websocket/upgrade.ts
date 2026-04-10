import http from 'http';
import url from 'url';
import { Request, RequestHandler } from 'express';
import { WebSocketServer } from 'ws';
import { AuthenticatedWebSocket } from './types';

export function initializeUpgradeHandler(
    server: http.Server,
    wss: WebSocketServer,
    sessionParser: RequestHandler
): void {
    server.on('upgrade', (request: Request, socket, head) => {
        // --- 添加详细日志：检查传入的请求头和 request.ip ---
        console.log('[WebSocket Upgrade] Received upgrade request.');
        console.log('[WebSocket Upgrade] Request Headers:', JSON.stringify(request.headers, null, 2));
        console.log(`[WebSocket Upgrade] Initial request.ip value: ${request.ip}`); // Express 尝试解析的 IP
        console.log(`[WebSocket Upgrade] X-Real-IP Header: ${request.headers['x-real-ip']}`);
        console.log(`[WebSocket Upgrade] X-Forwarded-For Header: ${request.headers['x-forwarded-for']}`);
        // --- 结束添加日志 ---

        const parsedUrl = url.parse(request.url || '', true); // Parse URL and query string
        const pathname = parsedUrl.pathname;

        // --- 修改：尝试从头部获取 IP，并处理 X-Forwarded-For 列表 ---
        let ipAddress: string | undefined;
        const xForwardedFor = request.headers['x-forwarded-for'];
        const xRealIp = request.headers['x-real-ip'];

        if (xForwardedFor) {
            // 如果 X-Forwarded-For 存在，取列表中的第一个 IP
            const ips = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor.split(',')[0];
            ipAddress = ips?.trim();
            console.log(`[WebSocket Upgrade] Using first IP from X-Forwarded-For: ${ipAddress}`);
        } else if (xRealIp) {
            // 否则，尝试 X-Real-IP
            ipAddress = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp.trim();
            console.log(`[WebSocket Upgrade] Using IP from X-Real-IP: ${ipAddress}`);
        } else {
            // 最后回退到 socket.remoteAddress 或 request.ip
            ipAddress = request.socket.remoteAddress || request.ip;
            console.log(`[WebSocket Upgrade] Using fallback IP: ${ipAddress}`);
        }

        // 确保 ipAddress 不是 undefined 或空字符串，否则设为 'unknown'
        ipAddress = ipAddress || 'unknown';
        console.log(`[WebSocket Upgrade] Determined IP Address: ${ipAddress}`);
        

        console.log(`WebSocket: 升级请求来自 IP: ${ipAddress}, Path: ${pathname}`); // 使用新获取的 ipAddress

        // @ts-ignore Express-session 类型问题
        sessionParser(request, {} as any, () => {
            // --- 认证检查 ---
            if (!request.session || !request.session.userId) {
                console.log(`WebSocket 认证失败 (Path: ${pathname})：未找到会话或用户未登录。`);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            console.log(`WebSocket 认证成功 (Path: ${pathname})：用户 ${request.session.username} (ID: ${request.session.userId})`);

            console.log(`WebSocket: Handling standard upgrade for user ${request.session.username}`);
            wss.handleUpgrade(request, socket, head, (ws) => {
                const extWs = ws as AuthenticatedWebSocket;
                extWs.userId = request.session.userId;
                extWs.username = request.session.username;
                (request as any).clientIpAddress = ipAddress;
                wss.emit('connection', extWs, request);
            });
        });
    });
    console.log('WebSocket upgrade handler initialized.');
}
