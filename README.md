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


## Khôi phục ví (10/2026)

- Hỗ trợ nhập JSON keypair chuẩn Solana gồm đúng 64 số byte (kiểu tệp xuất của phiên bản SolaMap trước).
- Hỗ trợ khôi phục seed phrase BIP-39 **tiếng Anh hợp lệ** với SLIP-0010 hardened path: `m/44'/501'/0'/0'` hoặc `m/44'/501'/0'`. **Phải so sánh địa chỉ với ví nguồn trước khi chuyển tiền**, vì các ví có thể dùng đường dẫn khác, tài khoản khác hoặc BIP-39 passphrase.
- Không ghi đè ví đang lưu trong trình duyệt: hãy sao lưu và xác minh ví cũ trước khi xóa hoặc chuyển sang môi trường trình duyệt riêng để nhập ví khác.
- Seed phrase không khôi phục được ví cũ vốn tạo từ `Keypair.generate()` và không có mnemonic. Hãy sử dụng file JSON keypair tương ứng.
- Hạn chế sử dụng Mainnet khi chưa được kiểm toán; không nhập seed phrase ví có tài sản giá trị lớn lên ứng dụng thử nghiệm, kể cả trang này.

## RPC và nhận SOL

- Cho phép cấu hình hai HTTPS RPC Mainnet riêng trong giao diện. Khi đọc số dư, lần lượt thử RPC chính, phụ và công cộng; RPC khác mạng bị loại theo genesis hash. RPC công cộng có thể chặn truy cập từ trình duyệt hoặc bị rate limit; fallback không đảm bảo hoạt động nếu không có RPC chuyên dụng.
- Chức năng gửi vẫn dùng một RPC cho mỗi giao dịch, tránh phát lại khi chưa xác minh signature. Lưu ý: phải đảm bảo cùng cluster giữa Phantom và SolaMap.
- Nhận SOL native không cần thao tác chấp nhận trên website; kiểm tra signature giao dịch từ Phantom để xác định giao dịch thật sự thành công, đúng mạng và đúng địa chỉ nhận.
- Luồng nhập seed/JSON và RPC mới **chưa được xác minh end-to-end bằng giao dịch Mainnet thật**. Các khóa bí mật đi qua JavaScript trong trang web; nhập liệu ở môi trường an toàn và không sử dụng khóa đang nắm giữ giá trị cao.


## Cập nhật tách tài khoản và Receive Monitor

- Ví SolaMap và Phantom được hiển thị riêng. Địa chỉ SolaMap nằm trong `solamap.localAddress`; đây là **public key**, không phải khóa bí mật. Nếu đang dùng ví đã tạo từ phiên bản cũ, hãy mở khóa bằng mật khẩu để ghi lại địa chỉ công khai cũ. Không xóa dữ liệu trình duyệt trước khi sao lưu.
- Ở mục Nhận SOL, chọn đúng ví SolaMap hoặc ví ngoài để QR hiển thị địa chỉ nhận tương ứng; ở mục Chuyển SOL chọn tài khoản gửi độc lập.
- RPC Manager kiểm tra genesis hash và timeout cho RPC đọc dữ liệu, sử dụng RPC HTTPS chính/phụ/công cộng. Các lần phát giao dịch không được tự động gửi lại sau timeout.
- Receive Monitor kiểm tra 15 giây/lần trong khi tab còn hiển thị, đọc số dư và 10 chữ ký gần đây. Lịch sử chữ ký không khẳng định SOL đã vào; kiểm tra transaction details để xác minh số lượng và người nhận. Phiên bản này sử dụng polling, **chưa bổ sung WebSocket**.
- Chưa tích hợp MetaMask/Solflare theo Wallet Standard trong giao diện; mục ví ngoài hiện hỗ trợ Phantom. Cần kiểm thử và kiểm toán trước khi sử dụng giá trị lớn trên Mainnet.
