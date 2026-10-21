# SolaMap Privacy Lab — Pre-deployment Security Review (Devnet)

**Rà soát:** 21/10/2026. **Kết luận: NO-GO** cho triển khai shield/unshield giữ SOL; simulator và RPC Devnet chỉ đọc có thể tiếp tục với nhãn minh bạch.  
**Phạm vi:** privacy-lab.html, docs/ và thư mục privacy/ độc lập trong tương lai; không thay đổi ví, Phantom, chuyển SOL, Mainnet, messenger hoặc xưởng program hiện có.  
**Phân loại:** Design review và checklist kỹ thuật, **không phải chứng thư audit độc lập**; chưa có Anchor program, ZK circuit hoặc verifier key được build/deploy.

## 1. Phân định Light Protocol và quyền riêng tư

| Công nghệ | Công dụng đúng | Không được suy ra |
|---|---|---|
| Light Protocol v1 | Tài liệu shielded pool lịch sử: note, nullifier, Groth16, cây Merkle | Bản cũ vẫn an toàn/được bảo trì/ABI tương thích |
| Light v2 ZK Compression | Xác minh integrity và ownership của compressed accounts, giảm state cost | Tự che số tiền hoặc danh tính |
| Indexed address tree / IMT | Unique address, non-membership proofs theo quy tắc Light | Tự thay được privacy-nullifier với PRF bí mật |
| Light validity proof | Bằng chứng dữ liệu compressed account hợp lệ đối với root | Tự xác minh conservation/secret spending authority trong circuit tùy chỉnh |
| Light v3/PSP (theo mô tả công khai) | Hướng nghiên cứu custom privacy proof | SDK production/private pool đã xác thực, đủ docs/ABI/audit |
| b402 | Tham khảo cấu trúc Anchor/Circom/privacy, chỉ định hướng | Bản mainnet playground được audit sản xuất |

**Kết luận:** Hai lớp proof có vai trò khác nhau. Privacy join-split proof phải nằm trong thiết kế riêng; Light compression adapter là **opt-in** sau đánh giá rò rỉ metadata. Light compressed calldata và events cần được coi là công khai; không gửi note preimage, owner bí mật, amount riêng tư, witness hoặc spending key vào compressed account plaintext.

Tài liệu nguồn:
- https://github.com/Lightprotocol/light-protocol
- https://github.com/Lightprotocol/light-protocol/blob/main/light-paper.md
- https://github.com/Lightprotocol/light-protocol-v1
- https://www.zkcompression.com/pda/compressed-pdas/guides/how-to-update-compressed-accounts
- https://github.com/Lightprotocol/program-examples
- https://github.com/mmchougule/b402-solana

Chú ý: Groth16 proof chuẩn thường 128 byte, **không phải** toàn bộ transaction 128 byte. Khi kết hợp join-split proof, Light validity proof, CPI, account metas và các instruction khác, phải **đo** transaction bytes và Compute Units; đừng suy diễn bảo đảm vừa giới hạn.

## 2. Kiến trúc mục tiêu

Browser: SolaMap Privacy Lab (Devnet)  
├── NoteManager: tạo note, phục hồi và mã hóa output bằng viewing key (chưa có)  
├── Secret witness + local/WASM ZK prover: không gửi máy chủ (chưa có)  
├── ZK circuit join-split 2 input / 2 output (chưa có)  
└── Public proof + commitment + nullifier + ciphertext  
    ├── Relayer: chỉ ký fee payer, KHÔNG giữ spending key  
    └── Anchor Shielded Pool (Devnet, CHƯA triển khai)  
        ├── Vault PDA + withdrawal instruction  
        ├── Immutable Groth16 verifier key / proof public inputs  
        ├── Commitment Merkle root / accepted root history  
        ├── Secret note nullifier registry hoặc structure có non-membership proof phù hợp  
        └── Program/pool/asset/account constraints & atomic transfer  
            └── Light Adapter TÙY CHỌN (chỉ non-sensitive metadata và state đã được chứng minh an toàn)

**Lựa chọn khuyến nghị:**
- Pha A: Anchor pool với Merkle tree và nullifier PDA/set độc lập để dễ kiểm toán tính an toàn, không dùng Light trong đường đi giá trị.
- Pha B: benchmark Light v2 cho public bookkeeping hoặc nullifier registry đã có kiểm chứng non-membership, chỉ sau Pha A.
- Pha C: nếu PSP có implementation, ABI, version và audit phù hợp thì thử trong nhánh riêng; không tích hợp theo mô tả marketing.

Light có thêm liveness dependency: indexer và forester, queue overflow/full, root history, proof freshness, tree rollover. Cần phương án đồng bộ lại và khôi phục dữ liệu khi indexer mất; cryptographic soundness không thay thế data availability.

## 3. Các bất biến circuit + program

| Mã | Điều kiện phải chứng minh và enforce |
|---|---|
| INV-01 | SUM(input lamports) + public_deposit = SUM(output lamports) + public_withdraw + relayer_fee, toàn bộ bằng số nguyên không overflow |
| INV-02 | Input note nằm trong root được chấp nhận và thuộc đúng pool, asset, denomination; người chi tiêu có private key/authorization được circuit kiểm chứng |
| INV-03 | Nullifier = PRF bí mật được ràng buộc note và đúng domain; duy nhất, không được replay, không bị reuse xuyên chain/pool/program |
| INV-04 | Giao dịch ghi nullifier, commitments và trả SOL trong cùng transaction nguyên tử; lỗi ở bất kỳ bước nào phải rollback toàn bộ |
| INV-05 | Public inputs ràng buộc receiver, withdrawal value, relayer, phí, expiry, program ID, pool ID, chain genesis hash, nonce/intent |
| INV-06 | Commitments có randomness riêng, không 0, không duplicate; Poseidon parameters/field canonical thống nhất giữa client và program |
| INV-07 | Dummy notes phải được ràng buộc bằng selector/mode hợp lệ, không cho tạo giá trị từ zero-value input |
| INV-08 | Account metas, signer, PDA seeds, CPIs, authority và executable flags xác minh rõ ràng; relayer không thay được output |
| INV-09 | Verifying key, circuit version, trusted setup artifacts, upgrade authority được pin bằng hash và chính sách multisig; không cho admin rút vault tùy ý |
| INV-10 | Vault rent reserves và khoản phí được tách riêng; ghi nhận toàn bộ liabilities theo notes còn tồn tại, kiểm tra solvency |
| INV-11 | Giới hạn root age/history và xử lý stale root/reorg an toàn; không chấp nhận state root giả |
| INV-12 | Giới hạn field modulus, u64/u128 lamports và hash canonical; chống truncation, malleability và alias khi public inputs |

## 4. Các thiếu sót từ vòng rà soát simulator

| ID | Mức độ | Trước khi sửa | Kết quả cập nhật |
|---|---|---|---|
| SIM-01 | Cao | Không có rollback nếu JS lỗi sau khi note/nullifier đổi | Thêm snapshot và restore mô phỏng; chưa thay thế on-chain atomicity |
| SIM-02 | Trung bình | Rút phí ra khỏi vault mà không ghi một đầu nhận phí | Ghi tài khoản demoRelayer, kiểm tra tổng tài sản |
| SIM-03 | Trung bình | Chưa đối chiếu vault = tổng note chưa tiêu | Thêm verifyLedger và cảnh báo bất biến |
| SIM-04 | Trung bình | RPC getSlot không xác minh cluster | So sánh getGenesisHash với Solana Devnet |
| SIM-05 | Critical | Không có circuit/verifier/vault thật | Khóa giao dịch on-chain, hiển thị NO-GO |
| SIM-06 | Cao | Không có encrypted note backup/recovery | Chưa mở tính năng note thật; bắt buộc phát triển/test |
| SIM-07 | Cao | Chưa phân tích rò rỉ qua Light calldata, relayer logs | Không bật Light adapter mặc định |
| SIM-08 | Critical | Không có audit độc lập cho cryptography/Anchor | Không cho phép triển khai pool giữ SOL cho người dùng |

**Lưu ý:** việc sửa SIM-01..04 chỉ làm simulator nhất quán. Không chứng nhận thành công test trình duyệt, cryptographic audit hoặc Devnet transaction.

## 5. Kiểm thử cần triển khai trước Devnet canary

- [ ] Pin SHA versions: Rust, Solana CLI, Anchor, Circom, snarkjs/gnark, Light SDK (nếu dùng), proving/verifying keys, trusted setup.
- [ ] Thiết lập unit test + integration test trên local-validator độc lập với simulator JS.
- [ ] Fuzz integer overflow, zero/dummy note, amount underflow, negative ext_amount, field encoding, unauthorized withdrawal.
- [ ] Kiểm thử double-spend (cùng nullifier hai lần) và gửi song song hai transaction cùng nullifier; tối đa một transaction được chấp nhận.
- [ ] Kiểm thử proof không hợp lệ, forged membership, stale root, forged root, sai verifier key, sai program hoặc sai pool.
- [ ] Thay receiver, amount, asset ID, relayer address, relayer fee, fee recipient, ciphertext commitment giữa lúc ký và phát: tất cả phải bị từ chối.
- [ ] Kiểm thử các lỗ hổng Anchor: PDA collisions, account substitution, arbitrary CPI, signer spoofing, upgrade authority, account re-init/close.
- [ ] Kiểm thử encrypted notes, backup, rescan, import/export, viewing-key separation và mất/khôi phục indexer.
- [ ] Kiểm tra rò rỉ privacy: timing, amount correlation, network metadata, phí relayer, logs, commitments/ciphertext length, anonymity set.
- [ ] Benchmark compute units và transaction bytes cho mỗi shield/transfer/unshield, cả khi sử dụng Light CPI.
- [ ] Light-only nếu tích hợp: proof freshness, forester offline, nullifier queue full, root rollover, indexer outage và khôi phục từ ledger.
- [ ] Kiểm tra RPC fail closed: 401/403/429/timeout, wrong genesis hash, reorg, finalized-only reads.
- [ ] Bổ sung CSP, SRI/lock dependencies, supply-chain review, không gửi key/witness qua Workers/R2/logging, cấu hình domain HTTPS.
- [ ] Kiểm toán độc lập circuit, program, SDK, relayer, key lifecycle; phản hồi tất cả Critical/High findings và re-audit sau sửa.
- [ ] Chỉ sau audit: deploy Devnet canary giới hạn bằng ví faucet mới, multisig upgrade authority, monitor liabilities/vault, rollback plan.

### Ma trận acceptance

| Test | Pass |
|---|---|
| Conservation + solvency | Mọi giao dịch giữ đúng invariant, không thất thoát lamports |
| Replay/concurrency | Một nullifier không thể được tiêu >1 lần |
| Proof binding | Thay receiver/fee/program/root = reject |
| Vault isolation | Không có đường rút SOL bỏ qua verifier |
| Root lifecycle | Root expire/rollover không mở cửa double spend |
| Key recovery | Backup mã hóa và khôi phục xem/chi tiêu trong môi trường thử |
| Privacy data | Không publish preimage, spending key, witness hoặc metadata quá mức |
| Networking | Không thể tương tác nhầm Mainnet từ Privacy Lab |
| Independent review | Code/circuit/params trùng đúng commit được audit, findings đóng |

## 6. Go / No-Go

- **SIMULATOR:** HTML/JS mô phỏng trong RAM, hash SHA-256 (không phải Poseidon), đọc Devnet RPC: ĐANG CÓ.
- **LOCAL PROTOTYPE:** circuit ZK, verifier, Anchor vault, local-validator tests: CHƯA CÓ.
- **DEVNET CANARY:** program với SOL faucet, test vector, limit và thông tin kiểm toán nội bộ: CHƯA CÓ.
- **EXTERNAL AUDIT:** đánh giá độc lập đầy đủ program + circuit + SDK + relayer: CHƯA CÓ.
- **MAINNET:** thẩm định luật pháp, audit, multisig và vận hành: CHƯA CÓ.

Mọi nút shield/unshield on-chain phải khóa cho tới khi allowlist đúng các tham số sau: Devnet genesis hash, program ID, circuit hash, verifying key hash, audit commit, trạng thái kiểm thử và giới hạn giao dịch.

### Compliance và trách nhiệm

Viewing key độc lập spending key có thể hỗ trợ disclosure có chọn lọc, nhưng không có cách bảo đảm thu hồi thông tin khi một viewing key đã bị lộ. Cần đánh giá nghĩa vụ AML/sanctions theo nơi triển khai. Phải công bố rằng ZK không bảo đảm không thể phân tích tương quan từ ví gửi/rút, thời điểm, số tiền và gas payer. Không dùng source code hoặc audit của Light để khẳng định SolaMap đã được audit.

---
*Hồ sơ này là kế hoạch rà soát kỹ thuật trên source tree, không phải chứng nhận an toàn hay bằng chứng đã giao dịch thành công trên Devnet.*
