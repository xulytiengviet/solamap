# Thiết lập Cloudflare RPC Gateway cho SolaMap

**Lưu ý:** Worker này chưa được triển khai vào tài khoản Cloudflare của bạn. Phải cung cấp RPC Mainnet riêng từ nhà cung cấp hợp lệ; không sử dụng public RPC cho sản xuất.

## 1. Tạo Workers
Tạo Worker mới trong Cloudflare Workers & Pages hoặc chạy `npx wrangler deploy` trong thư mục `cloudflare-rpc/`.

## 2. Cấu hình Secrets
Đặt `SOLANA_RPC_PRIMARY` và `SOLANA_RPC_BACKUP` là **URL HTTPS đầy đủ** của RPC Solana Mainnet từ hai nhà cung cấp khác nhau. Trong terminal có thể dùng:
```bash
npx wrangler secret put SOLANA_RPC_PRIMARY
npx wrangler secret put SOLANA_RPC_BACKUP
npx wrangler deploy
```
Không đưa API key vào `wrangler.toml`, mã JavaScript GitHub hoặc trường RPC trên website.

## 3. Kiểm tra
- `GET https://<ten-worker>.<tai-khoan>.workers.dev/health` trả `configured: true` chỉ có nghĩa đã cấu hình URL chính, không chứng minh upstream hoạt động.
- Mở SolaMap và nhập `https://<ten-worker>.<tai-khoan>.workers.dev/rpc` vào trường **RPC Mainnet chính**; bỏ trống RPC phụ trong giao diện (Worker đã tự có dự phòng).
- Bấm **Kiểm tra RPC**. Phải trả genesis hash Mainnet và slot; sau đó bấm **Làm mới số dư**.
- Nếu lỗi `403` hãy kiểm tra Origin đúng `https://xulytiengviet.github.io`, các WAF rules, và quyền truy cập Worker.
- Nếu lỗi `503`, kiểm tra Secrets và upstream RPC (API key, rate limit, Mainnet).
- Nếu số dư vẫn không thấy nhưng RPC hoạt động, đối chiếu public key cùng mạng với Solana Explorer và Tx Signature của khoản Pump.fun.

## 4. Giới hạn bảo mật
- CORS **không phải cơ chế xác thực**; endpoint công khai có thể bị gọi bằng script/server. Áp dụng Cloudflare Rate Limiting/WAF và quota upstream.
- Worker xác nhận genesis khi gọi nên tăng latency/cost; production có thể cache kết quả trong thời gian ngắn theo URL.
- Chỉ forward các method trong allowlist, không chấp nhận batch, giới hạn kích thước request.
- `sendTransaction` chỉ dùng RPC chính và **không tự retry/failover**, tránh phát lại khi chưa rõ trạng thái.
- Không gửi seed phrase, private key hoặc password cho RPC. Cần theo dõi các lỗi, nhưng không ghi raw signed transaction vào log.
- Gateway chỉ hỗ trợ HTTP JSON-RPC; Receive Monitor dùng polling, không hỗ trợ websocket subscriptions.
