# FnzSafe → SolaMap: kế hoạch tích hợp được kiểm chứng

Nguồn: https://github.com/0xfnzero/FnzSafe (MIT, copyright 2025 0xfnzero).
Dự án đích: https://github.com/xulytiengviet/solamap (MIT, Long Ngo).

## Đối chiếu thực tế (2026-10-19)
- `crates/core/Cargo.toml`: `fnzero-safe-core = 0.1.8`, `aes-gcm`, `argon2`, `bip39`, `solana-sdk`, `solana-derivation-path`, `zeroize`.
- `crates/chain-core`: khai báo mạng CAIP-2 / CAIP-10 và capability-based adapters.
- `apps/desktop`: Next.js giao diện kết hợp Tauri + local API Rust, **không phải HTML static drop-in**.
- `apps/mobile`: Flutter + Rust bridge.
- FnzSafe README công bố Solana Mainnet/Devnet/Testnet, SOL/SPL/Token-2022, giao dịch, dApp, EVM, encrypted local keystores.
- Mã nguồn được cấp phép MIT nhưng **chưa có xác minh kiểm toán độc lập** cho cách tích hợp mới.

## Chỉ rõ những phần có thể tái sử dụng
1. **Thiết kế**: cấu trúc account rõ ràng, capability/chain ID, trạng thái giao dịch, hoạt động ký.
2. **Mô-đun Rust**: nghiên cứu dùng `fnzero-safe-core` cho **ứng dụng desktop Tauri riêng**, không đưa secret sang HTTP API công khai. Giữ mọi xử lý bí mật trong Rust; rà soát thuộc tính zeroize, mật khẩu và bảo vệ máy chủ localhost.
3. **Website GitHub Pages**: giữ hướng wallet-adapter để kết nối Phantom/Solflare và các provider Wallet Standard, dùng RPC read-only/transaction analytics. Không cố nạp native desktop core trực tiếp bằng `<script>`.
4. **WebAssembly nếu xây dựng**: cần xác minh đường biên FFI, ngẫu nhiên, secure context, CSP, SRI, compatibility và mối đe dọa XSS; WASM **không tự bảo vệ khóa** khỏi mã JavaScript độc hại cùng origin.

## Lộ trình P0 → P3
P0: ngừng thay đổi định dạng kho khóa của người dùng; đóng băng backup/import; xác nhận từng địa chỉ công khai. Hoàn thiện bộ kiểm thử đơn vị và e2e Devnet, gồm lệnh gửi SOL, khôi phục seed & JSON, RPC 429/403/timeout, ngắt tab, sign-and-send.
P1: phân tách rõ ví nội bộ/ ví ngoài trong giao diện; không hiển thị sai địa chỉ nhận khi đổi provider. Chuyển mọi read (balance, history, parsed transaction, status) qua RPC manager có kiểm tra genesis, timeout và số liệu lỗi; send chỉ một lần với lưu chữ ký để đối chiếu.
P2: Receive Monitor: xác nhận slot, balance trước/sau và instruction System Program, bao gồm inner instructions/fee thay đổi; không gọi mọi chữ ký là khoản tiền đến. Polling fallback; WebSocket subscriptions qua RPC WSS tương ứng có backoff.
P3: sản phẩm FnzSafe-derived desktop riêng (Tauri+Rust) với import/export tương thích SolaMap; giữ web SolaMap như dApp dùng wallet adapter. Có thể cân nhắc EVM sau khi Solana Mainnet được kiểm thử.

## Kiểm thử chấp nhận trước Mainnet
- Mnemonic BIP-39 + path SLIP-0010 khôi phục ra đúng địa chỉ theo test vectors; keypair JSON lịch sử không đổi địa chỉ.
- Không hiển thị key private trong log/URL/console/network. Mật khẩu và mnemonic không truyền tới RPC.
- Gửi Phantom → ví SolaMap trên Devnet: signature finalized, destination trùng địa chỉ nhận, lamport delta/transaction effects phù hợp. Thử ngược lại, và thử mainnet bằng lượng nhỏ sau review.
- Không tự gửi lại nếu transaction status chưa xác định; không báo SUCCESS trước RPC xác nhận.
- Một RPC trả sai genesis bị loại, RPC 429/timeout được báo và read chuyển dự phòng.
- Dữ liệu đã lưu theo khóa `solamap.wallet.v1` không bị migration xóa hay ghi đè.

## Giấy phép / phát hành
Giữ nguyên giấy phép và copyright notice của FnzSafe khi sao chép phần mã tương ứng. Kiểm tra giấy phép từng dependency và asset. Công bố rõ thành phần nguồn gốc, thay đổi và cảnh báo bảo mật. Không quảng cáo ứng dụng web như đã tích hợp FnzSafe Rust khi thực tế chưa build và test bản port.

## Lưu ý riêng về Pump.fun
Không có Transaction Signature nên chưa thể kết luận khoản gửi thất bại ở đâu. Với native SOL, tài khoản nhận không cần mã ví đặc biệt hay người dùng chấp nhận. Giao dịch có thể liên quan SPL, WSOL, program inner transfer, hoặc địa chỉ đích không khớp; phải phân tích parsed transaction + pre/post balances, inner instructions, logs và slot trước khi quyết định sửa wallet code.
