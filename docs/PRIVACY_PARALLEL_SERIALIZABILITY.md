# SolaMap Privacy Lab — Immutable UTXO, historical Merkle roots and conflict scheduling

**Thiết kế đề xuất:** ngày 21-10-2026. **Trạng thái:** chỉ mô phỏng JS và GitHub Actions, NO-GO on-chain. **Mạng mục tiêu:** Solana Devnet.  
**Không thay đổi:** ví SOL hiện hữu, màn hình Gửi/Nhận, Phantom, Mainnet, xưởng program, Messenger, RPC manager.

## 1. Mục tiêu

Cho phép tạo witness/membership proof song song từ snapshot Merkle bất biến, sau đó cho từng giao dịch ghi nguyên tử trên các account đủ độc lập để Solana *có thể* lên lịch đồng thời. Mọi kết quả được chấp nhận phải tương đương một thứ tự tuần tự hợp lệ (serializability). Không gán mục tiêu TPS trước benchmark Devnet.

- Input note: bất biến, là leaf của commitment tree chỉ thêm mới (append-only).
- Tính hợp lệ: proof membership trên một historical root được on-chain program chấp nhận, đồng thời nullifier phải chưa tồn tại.
- Output: đúng hai commitment mới trên một hoặc nhiều output queue được định tuyến có kiểm soát.
- Nullifier: deterministic, domain-separated PRF, không thể chọn shard tùy ý.
- Vault: chỉ write-lock khi shield/unshield; không ghi trong private transfer nội bộ.

## 2. Account conflict

Định nghĩa reads (R_i), writes (W_i), input IDs (I_i), nullifiers (N_i). Hai giao dịch có thể cùng wave khi:

- (N_i\cap N_j=\varnothing) và (I_i\cap I_j=\varnothing).
- (W_i\cap(R_j\cup W_j)=\varnothing).
- (W_j\cap(R_i\cup W_i)=\varnothing).

Trong simulator, account ids là các nhãn **trừu tượng**: `root-snapshot:<root>` (read-only), `nullifier:<shard>`, `queue:<shard>`, `vault:main` và `fee-payer:<index>`. Mỗi wave được nhóm bằng greedy first-fit; không có tuyên bố tối ưu graph coloring.

**Quan trọng:** trong Solana thật, một PDA root history có thể bị khóa ghi khi cập nhật. Nếu mọi giao dịch cập nhật cùng account gốc, mọi private transfer sẽ bị serialize. Do đó, root history phải là *immutable published snapshot*, quá trình đưa các output từ queue vào Merkle tree cần được xử lý trong maintenance/forester transaction khác hoặc theo batch với account ownership độc lập. Các thành phần này CHƯA triển khai và CHƯA được kiểm toán. Simulator tính root mới cục bộ sau mỗi commit để trực quan hóa, **không mô phỏng đúng account lock của quy trình publish root on-chain**.

Một cặp note ở khác shard nullifier nhưng cùng output queue vẫn xung đột. Nếu fee payer trùng nhau và Solana cần write lock account đó, nó cũng trở thành bottleneck. Với 2-input-2-output, chạm nhiều shard làm giảm khả năng song song.

## 3. Snapshot và root lifecycle

Ví dụ A và B đều tạo membership witness cho (R_{100}):

- A tiêu note a, B tiêu note b, và cả a/b đã thuộc (R_{100}).
- A append outputs vào output queue; B vẫn có thể được chấp nhận trên root (R_{100}) nếu B có nullifier chưa dùng và root còn trong allowlist.
- B tuyệt đối không thể tiêu note output của A trước khi giao thức bảo đảm output đó đã tồn tại và có membership/queue proof được chấp nhận.
- Các historical roots cần validity window, root index, version, tree id, sequence và các quy tắc stale root/rollover cố định.

Mô hình proof SHA-256 và root history trong simulator **không tương đương** Poseidon / Groth16 / Light validity proof. Bắt buộc kiểm tra proof canonical, root authenticity và circuit binding trong Anchor Program độc lập.

## 4. Định tuyến nullifier bắt buộc

`shard = uint256(SHA-256(domain || nullifier)) mod K` trong simulator. Thiết kế production phải chọn hash, byte order, field encoding, domain canonical và kiểm thử cùng vector Rust/TypeScript/circuit.

- K thuộc tập {1,2,4,8} trong **mô phỏng**.
- K được cố định tại pool version, không đổi tùy ý trong lifecycle.
- Nullifier chỉ được đánh dấu đã dùng ở shard mà program tự tính.
- Migration K=4 sang K=8 **không** dùng mod 8 để ghi nullifier cũ rồi quên bảng K=4; phải giữ route lịch sử, proof uniqueness xuyên epochs hoặc thực hiện version-specific registry và chặn replay.
- Non-membership proof hay PDA uniqueness phải thuộc lớp security-critical được audit.

Simulator giữ nullifier trong memory Map và kiểm tra lại lúc commit. **Không có PDA, Indexed Merkle Tree hay compressed nullifier thật.**

## 5. Chuyển trạng thái phải nguyên tử

Đường production chỉ hợp lệ khi **cùng một Solana transaction**:

1. Xác minh program ID, pool/asset/cluster, circuit/version, canonical public inputs.
2. Xác minh privacy join-split proof + membership trên một root nằm trong allowlist.
3. Xác minh tất cả nullifier chưa tồn tại và route shard đúng.
4. Đánh dấu chi tiêu nullifier, thêm output commitments vào các queue.
5. Với shield/unshield, chuyển lamports qua vault signer PDA và trả phí được ràng buộc.
6. Nếu bất cứ thao tác nào lỗi, transaction không được ghi một trạng thái một phần.

Các bất biến:

- Transfer: (\sum V_{in}=\sum V_{out}); vault không chuyển SOL.
- Unshield: (\sum V_{in}=\sum V_{out}+V_{withdraw}+V_{relayerFee}).
- Shield: (\sum V_{in}+V_{deposit}=\sum V_{out}).
- Mỗi tài sản riêng (mint/asset ID), lamports integer có range check, không modulo alias.

Ở **mô phỏng**, Node/browser mã hóa hash bất đồng bộ, nên commit sử dụng một JS promise barrier để tuần tự hóa cập nhật. Nó không khẳng định nhiều JS commit thực thi đồng thời. Solana/Anchor cần triển khai account locks + CPI thực và kiểm tra atomicity bằng local validator.

## 6. Light integration

Theo [Light Protocol whitepaper](https://github.com/Lightprotocol/light-protocol/blob/main/light-paper.md), trạng thái compressed accounts dùng validity proof và tree / queue; Light ghi nullifier của **compressed account**, không mặc nhiên là nullifier riêng tư. Client SDK có thể yêu cầu validity proof từ RPC/indexer hỗ trợ compression. Dữ liệu gửi qua transaction vẫn có khả năng công khai trên chain.

- Không đưa bí mật note, amount plaintext, spending/viewing private key hay witness vào calldata.
- Không coi Light compressed state proof là join-split privacy proof.
- Cần đo CU, tx bytes (giới hạn tx Solana), indexer latency, forester downtime, queue rotation, tree rollover, stale proof và batch worker root publication.
- Light Adapter được giữ **tùy chọn và chưa bật**. Pha đầu tiên kiểm tra độc lập Anchor circuit + nullifier PDA (chi phí cao hơn nhưng dễ audit).

Nguồn:  
https://github.com/Lightprotocol/light-protocol  
https://www.zkcompression.com/home  
https://github.com/solana-foundation/developer-content/blob/main/docs/core/transactions.md

## 7. Acceptance tests + benchmark

Đã tự động hóa trong `tests/privacy-parallel.test.mjs`:
- K = 1, 2, 4, 8 phải giữ vault solvency và đúng một replay bị từ chối.
- Nhiều transaction cùng historical root phải được chấp nhận nếu input khác nhau.
- Hai transaction cố tiêu cùng note, kể cả fee payer khác nhau, chỉ tối đa một thành công.
- Root cũ quá thời hạn bị reject, không được mất note.
- Mismatched nullifier shard hoặc forged root phải reject.
- Private transfer không ghi vault; unshield ghi vault.
- Spending output phụ thuộc phải chờ output được commit và có snapshot mới.
- Số lượng wave và bề rộng wave được tính bằng account conflict graph.

**Benchmark trên Devnet cần thêm, CHƯA thực hiện:**

| Cấu hình | Dữ liệu cần đo | Rủi ro chính |
|---|---|---|
| K=1 | accepted tx/s, p50/p95, CU, bytes, phí/tx, retry | queue/tree lock |
| K=2 | các metric như trên, load đồng nhất | skew shard |
| K=4 | các metric như trên, 2-input/2-output | cross-shard locks |
| K=8 | các metric như trên, nhiều fee payer | rent/forester/operational cost |

Tất cả cấu hình phải có traffic mix giống nhau, concurrency cùng mức, note selection policy cố định, warm-up, retry policy công khai. Đo slot-level thực thi, throughput theo finalized, không tính submit requests là success. Dùng nhiều RPC endpoints để loại bỏ nghẽn do nhà cung cấp. Xuất logs và CSV với commit SHA, program ID, verifier hash, K, network genesis.

## 8. Security gates

**NO-GO** đối với bất kỳ nút gửi shield/unshield on-chain nếu chưa có Anchor, circuit, proof verifier, nullifier registry on-chain, accepted roots, multi-account atomic tests, audited keys, rollback/recovery và kiểm toán độc lập.

**KHÔNG** dùng kết quả 13/13 bài kiểm thử JS để tuyên bố “đã đạt serializability on-chain” hay “tối ưu hơn Light Protocol”.

**Kiến trúc tốt nhất để thử tiếp theo:** module Anchor độc lập với 4 K thử nghiệm, root lịch sử có phiên bản, nullifier shard PDA cố định, output queues độc lập. Chạy audit adversarial local-validator trước khi cân nhắc Devnet canary. Chỉ tích hợp Light Adapter nếu có chứng cứ đo đạc lợi ích và privacy leakage assessment.
