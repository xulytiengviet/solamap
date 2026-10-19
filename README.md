# SolaMap · Solana Web3 Lab

Giao diện học tập Solana bằng tiếng Việt. Thiết kế: Long Ngo. License: MIT.

## Chức năng

- Tạo keypair ngay trong trình duyệt, mã hóa bằng WebCrypto (AES-GCM / PBKDF2), lưu bản mã hóa trong localStorage.
- Mở khóa, khóa phiên, xuất file keypair để sao lưu. **File xuất là khóa bí mật, không được chia sẻ.**
- Kết nối ví Phantom; xem số dư qua JSON RPC.
- Gửi SOL, ghi Memo UTF-8 (tối đa 500 byte) và xem transaction trên Solana Explorer.
- Biên tập mã Rust/Anchor, sao chép hoặc tải `lib.rs`, mở Solana Playground để build/deploy.
- Kiểm tra program ID on-chain và tra cứu chữ ký giao dịch.

## Chạy và xuất bản

Đây là ứng dụng HTML/CSS/JS tĩnh: mở `index.html` qua máy chủ HTTPS hoặc bật GitHub Pages từ nhánh `main`, thư mục `/ (root)`.
Ứng dụng tải thư viện `@solana/web3.js` v1.98.4 từ unpkg; cần Internet và endpoint RPC hoạt động.

## Build và deploy Anchor qua Playground

1. Mở https://beta.solpg.io
2. Tạo ví Playground cho Devnet, lấy Devnet SOL từ https://faucet.solana.com
3. Tạo project Anchor, dán mã SolaMap vào `src/lib.rs`.
4. Sử dụng Program ID được Playground cấp (thay placeholder `declare_id!`).
5. Chọn Build rồi Deploy. Lấy Program ID và tra cứu trong SolaMap.

## Bảo mật

**Chỉ sử dụng ví mới tạo để học tập.** Không nhập khóa có tài sản thật. Dữ liệu trong localStorage có thể mất khi xóa dữ liệu trình duyệt; ứng dụng hiện không có quy trình nhập lại keypair đã sao lưu. Ví cục bộ chưa qua kiểm toán bảo mật. Hạn chế dùng mainnet. Memo là dữ liệu công khai, vĩnh viễn. RPC công cộng có thể giới hạn tốc độ và sẵn có. Với Phantom, đảm bảo mạng trong ví trùng mạng được chọn trên giao diện.

Ứng dụng không chạy backend, không thu thập khóa bí mật lên server của dự án. Dùng thư viện từ CDN và phụ thuộc nguồn RPC bên thứ ba; production cần CSP, SRI/bundle cố định, kiểm toán và kiểm thử đa trình duyệt.
