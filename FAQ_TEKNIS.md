# FAQ TEKNIS - SISTEM ABSENSI ALONICA CAFE

## Pertanyaan Teknis Mendalam untuk Persiapan Sidang

---

## 🔬 FACE RECOGNITION

### Q1: Jelaskan perbedaan antara Face Detection dan Face Recognition!

**Jawaban**:

**Face Detection**:
- **Tujuan**: Menemukan lokasi wajah dalam gambar
- **Output**: Bounding box coordinates (x, y, width, height)
- **Algoritma**: RetinaFace, MTCNN, Haar Cascade
- **Use case**: "Apakah ada wajah di gambar ini?"

**Face Recognition**:
- **Tujuan**: Mengidentifikasi siapa pemilik wajah
- **Output**: Identity/label (e.g., "John Doe") + confidence score
- **Algoritma**: ArcFace, FaceNet, DeepFace
- **Use case**: "Siapa orang ini?"

**Pipeline**: Detection → Alignment → Recognition

---

### Q2: Apa itu face embedding? Mengapa 512 dimensi?

**Jawaban**:

**Face Embedding**:
- Representasi numerik wajah dalam vector space
- Hasil dari deep CNN (Convolutional Neural Network)
- Dimensi 512 adalah output dari ArcFace model

**Analogi**: 
- Seperti "fingerprint" matematika dari wajah
- Wajah mirip → embedding berdekatan di vector space
- Wajah beda → embedding berjauhan

**Kenapa 512 dimensi?**:
1. **Trade-off**: Balance antara information richness dan computational efficiency
   - Too small (64-d): Kehilangan detail, akurasi turun
   - Too large (2048-d): Overkill, slower, risk overfitting
   
2. **Empirical**: Research menunjukkan 512-d optimal untuk face recognition
   - ArcFace: 512-d
   - FaceNet: 128-d atau 512-d
   
3. **Storage**: 512 floats = 2KB per embedding (efficient untuk database)

---

### Q3: Jelaskan Cosine Similarity secara detail!

**Jawaban**:

**Formula**:
```
similarity = (A · B) / (||A|| × ||B||)

A · B = Σ(Ai × Bi)  [dot product]
||A|| = √(Σ Ai²)    [magnitude]
```

**Range**: -1 to 1
- 1: Identik (sama persis)
- 0: Orthogonal (tidak ada similarity)
- -1: Opposite

**Untuk face recognition**:
- Embeddings di-normalize ke unit length (||A|| = 1)
- Jadi formula simplify jadi: similarity = A · B
- Range praktis: 0.2 - 0.95

**Contoh**:
```python
emb_A = [0.5, 0.5, 0.5, 0.5]  # Normalized
emb_B = [0.5, 0.5, 0.5, 0.5]  # Same person
similarity = 0.5*0.5 + 0.5*0.5 + 0.5*0.5 + 0.5*0.5 = 1.0

emb_C = [-0.5, -0.5, -0.5, -0.5]  # Different person
similarity = 0.5*(-0.5)*4 = -1.0
```

**Kenapa Cosine, bukan Euclidean?**:
- Cosine fokus pada angle (direction), bukan magnitude
- Robust terhadap brightness variation
- Better untuk normalized embeddings

---

### Q4: Bagaimana cara kerja RetinaFace?

**Jawaban**:

**RetinaFace** = Multi-task learning untuk face detection

**5 Tasks simultaneously**:
1. **Face classification**: Wajah atau bukan?
2. **Bounding box regression**: Koordinat x,y,w,h
3. **5 Facial landmarks**: 2 eyes, nose, 2 mouth corners
4. **3D face info**: Pitch, yaw, roll (optional)
5. **Dense landmarks**: 68 points (optional)

**Architecture**:
```
Input Image (640x640)
    ↓
Backbone (ResNet-50)
    ↓
Feature Pyramid Network (FPN)
    ↓
Multi-task Branches
    ├→ Classification Head
    ├→ Bbox Regression Head
    └→ Landmark Regression Head
    ↓
Output: Faces + Landmarks
```

**Keunggulan**:
- Multi-scale detection (small to large faces)
- Akurat pada challenging conditions (occlusion, blur)
- Self-supervised by landmarks

---

### Q5: Apa itu ArcFace Loss? Mengapa lebih baik dari Softmax?

**Jawaban**:

**Problem dengan Softmax**:
- Hanya optimize untuk classification
- Embeddings tidak necessarily well-separated
- Inter-class distance bisa kecil

**ArcFace Solution**: Additive Angular Margin Loss

**Formula**:
```
L = -log(e^(s·cos(θ+m)) / (e^(s·cos(θ+m)) + Σe^(s·cos(θj))))

θ = angle between embedding and class center
m = angular margin (e.g., 0.5)
s = scale factor (e.g., 64)
```

**Intuisi**:
- Add margin (m) untuk memaksa separation yang lebih besar
- Lebih sulit untuk classify → model learn better features
- Angular margin = rotation di hypersphere

**Visualization**:
```
Softmax:
Class A: ●●●●
Class B:   ●●●●  [bisa overlapping]

ArcFace:
Class A: ●●●●
           [margin]
Class B:         ●●●●  [clear separation]
```

**Impact**:
- Softmax: ~95% accuracy
- ArcFace: ~99.8% accuracy (LFW dataset)

---

## 🛡️ ANTI-SPOOFING

### Q6: Jelaskan texture analysis untuk anti-spoofing secara detail!

**Jawaban**:

**Prinsip**: Foto cetak/digital memiliki tekstur berbeda dari wajah asli.

**Method 1: Laplacian Variance (Blur Detection)**

```python
laplacian = cv2.Laplacian(grayscale_image, cv2.CV_64F)
variance = laplacian.var()
```

**Interpretation**:
- Wajah asli: Variance medium (100-400)
  - Natural texture, pori-pori, rambut halus
- Foto cetak: Variance low (<50)
  - Over-smoothed, printing artifacts
- Foto digital di layar: Variance very high (>500)
  - Screen pixels, moire pattern

**Method 2: Local Binary Pattern (LBP)**

```python
# LBP encoding
center_pixel = intensity[center]
neighbors = intensity[surrounding_8_pixels]

binary_code = []
for n in neighbors:
    binary_code.append(1 if n >= center_pixel else 0)

lbp_value = convert_binary_to_decimal(binary_code)
```

**LBP Histogram**:
- Wajah asli: Complex distribution (high entropy)
- Foto: Simpler distribution (low entropy)

```python
entropy = -Σ(p(i) × log2(p(i)))

Real face: entropy > 4.5
Photo: entropy < 4.0
```

**Method 3: Frequency Domain Analysis**

```python
fft = np.fft.fft2(image)
magnitude = np.abs(fft)
```

- Wajah asli: Balanced frequency spectrum
- Foto: Unnatural frequency peaks (dari printer resolution)

---

### Q7: Bagaimana motion detection untuk liveness check?

**Jawaban**:

**Concept**: Video replay/photo tidak bisa follow real-time instruction.

**Implementation**:

**Step 1: Multi-frame capture**
```python
frames = []
for i in range(5):  # Capture 5 frames dalam 2 detik
    frame = camera.capture()
    frames.append(frame)
    time.sleep(0.4)
```

**Step 2: Extract embeddings**
```python
embeddings = []
for frame in frames:
    emb = arcface.extract(frame)
    embeddings.append(emb)
```

**Step 3: Consistency check**
```python
# Check embedding consistency
similarities = []
for i in range(len(embeddings)-1):
    sim = cosine_similarity(embeddings[i], embeddings[i+1])
    similarities.append(sim)

# Wajah asli: High consistency (>0.85)
# Video replay: Bisa high juga
# Foto: Low consistency (head movement)
```

**Step 4: Optical flow**
```python
flow = cv2.calcOpticalFlowFarneback(
    prev_gray, next_gray, None, 
    pyr_scale=0.5, levels=3, ...
)

motion_magnitude = np.mean(np.sqrt(flow[...,0]**2 + flow[...,1]**2))

# Real face dengan head movement: 2-10 pixels/frame
# Foto held still: <1 pixel
# Video replay: Depends on video
```

**Challenge**: User experience
- Terlalu strict → user frustrated
- Balance: Optional challenge (hanya jika suspicious)

---

## 🏗️ ARCHITECTURE & DESIGN

### Q8: Mengapa memilih FastAPI dibanding Flask atau Django?

**Jawaban**:

**Comparison**:

| Feature | Flask | Django | FastAPI |
|---------|-------|--------|---------|
| Performance | Medium | Medium | **High** |
| Async Support | Via extension | Limited | **Native** |
| Auto API Docs | No | Via DRF | **Built-in** |
| Type Hints | No | No | **Yes** (Pydantic) |
| Learning Curve | Easy | Steep | Medium |
| Suitable For | Small apps | Full web apps | **APIs** |

**Alasan Pilih FastAPI**:

1. **Performance**: 
   - ASGI (async) vs WSGI (sync)
   - Benchmark: FastAPI ~3x faster than Flask
   - Important untuk face recognition (CPU-intensive)

2. **Auto Documentation**:
   - Swagger UI built-in (/docs)
   - Easy untuk testing & debugging

3. **Type Safety**:
   - Pydantic models untuk request validation
   - Catch errors early (development time)

4. **Modern Python**:
   - Async/await syntax
   - Type hints (PEP 484)

5. **Ecosystem**:
   - Uvicorn (fast ASGI server)
   - SQLAlchemy integration smooth

**Example**:
```python
@app.post("/attendance/recognize")
async def recognize(file: UploadFile = File(...)):
    # Auto validation: file must be present
    # Auto docs: shows file parameter
    # Async: non-blocking
    ...
```

---

### Q9: Mengapa SQLite? Kapan harus migrate ke PostgreSQL?

**Jawaban**:

**Pilih SQLite untuk Development**:

**Pros**:
- ✅ Zero configuration (file-based)
- ✅ Portable (single .db file)
- ✅ Lightweight
- ✅ Perfect untuk prototype/skripsi

**Cons**:
- ❌ Limited concurrent writes
- ❌ No network access (same machine only)
- ❌ Scalability limit (~100K rows OK, 1M+ slow)

**Migrate ke PostgreSQL ketika**:

1. **Concurrent Users**: >10 simultaneous writes
   - SQLite: Lock database pada write
   - PostgreSQL: MVCC (Multi-Version Concurrency Control)

2. **Production Deployment**:
   - Multiple backend instances
   - Remote database access

3. **Data Volume**: >100MB atau >100K attendance logs
   - PostgreSQL better query optimization
   - Partitioning support

4. **Advanced Features**:
   - Full-text search
   - JSON queries
   - Replication, backup

**Migration Path**:
```python
# 1. Change DATABASE_URL in .env
DATABASE_URL=postgresql://user:pass@localhost/alonica

# 2. SQLAlchemy automatically handles dialect
# No code change needed!

# 3. Migrate data
# Export: sqlite3 old.db .dump > dump.sql
# Import: psql alonica < dump.sql (with adjustments)
```

---

### Q10: Jelaskan JWT authentication flow!

**Jawaban**:

**JWT Structure**:
```
eyJhbGci...  .  eyJzdWIi...  .  SflKxwRJ...
  Header         Payload         Signature
```

**Header**:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload**:
```json
{
  "sub": "admin",           // Subject (username)
  "exp": 1705392000,        // Expiry (Unix timestamp)
  "iat": 1704787200         // Issued at
}
```

**Signature**:
```
HMACSHA256(
  base64(header) + "." + base64(payload),
  SECRET_KEY
)
```

**Authentication Flow**:

```
1. Login
   Client → POST /auth/login {username, password}
   Server → Verify credentials
   Server → Generate JWT with payload
   Server → Return {"access_token": "eyJ...", "token_type": "bearer"}

2. Authenticated Request
   Client → GET /employees
            Header: Authorization: Bearer eyJ...
   Server → Extract token from header
   Server → Verify signature (using SECRET_KEY)
   Server → Check expiry (exp claim)
   Server → If valid: Process request
            If invalid: Return 401 Unauthorized

3. Token Refresh (optional)
   Client → POST /auth/refresh
   Server → Issue new token with extended expiry
```

**Security**:
- Token signed dengan SECRET_KEY (hanya server tahu)
- Tampering detected (signature invalid)
- Stateless (no server-side session storage)
- Expiry auto-enforcement

**Implementation**:
```python
from jose import jwt

# Generate
token = jwt.encode(
    {"sub": username, "exp": datetime.utcnow() + timedelta(days=7)},
    SECRET_KEY,
    algorithm="HS256"
)

# Verify
try:
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    username = payload.get("sub")
except JWTError:
    raise HTTPException(401, "Invalid token")
```

---

## 📊 DATABASE & OPTIMIZATION

### Q11: Mengapa menyimpan embeddings sebagai JSON array, bukan table terpisah?

**Jawaban**:

**Current Design**:
```
employees
  - id
  - nama
  - face_embeddings_json: TEXT  ← JSON array of embeddings
```

**Alternative Design**:
```
employees
  - id
  - nama

face_embeddings  (separate table)
  - id
  - employee_id (FK)
  - embedding_vector: TEXT
  - created_at
```

**Trade-offs**:

| Aspect | JSON Array (Current) | Separate Table |
|--------|----------------------|----------------|
| **Query Simplicity** | ✅ Single query | ❌ JOIN needed |
| **Atomicity** | ✅ Update all embeddings together | ❌ Multiple INSERTs |
| **Storage** | Medium | Medium |
| **Flexibility** | ❌ Hard to query individual embedding | ✅ Easy |
| **Performance** | ✅ Faster (no JOIN) | Depends |

**Why JSON for this project**:

1. **Access Pattern**: 
   - Always read ALL embeddings untuk matching
   - Tidak pernah query individual embedding

2. **Atomicity**:
   - Update embeddings = atomic operation
   - No consistency issues

3. **Simplicity**:
   - Fewer tables
   - Easier untuk prototype

**When to use Separate Table**:
- Need to query individual embeddings
- Need to track metadata per embedding (capture_date, quality_score, etc.)
- Need to analyze embedding drift over time

**Future Enhancement**:
- Gunakan PostgreSQL **ARRAY type** untuk native array support
```sql
face_embeddings REAL[512]  -- Native array in PostgreSQL
```

---

### Q12: Bagaimana cara optimize face matching untuk 1000+ karyawan?

**Jawaban**:

**Current Approach** (Brute Force):
```python
for employee in all_employees:
    for embedding in employee.face_embeddings:
        similarity = cosine_similarity(query_embedding, embedding)
        if similarity > best_similarity:
            best_match = employee
```

**Complexity**: O(N × M)
- N = number of employees
- M = average embeddings per employee (20)
- For 1000 employees: 20,000 comparisons

**Response time**: ~2 seconds (CPU-bound)

**Optimization Strategies**:

**1. Approximate Nearest Neighbor (ANN)**

**Problem**: Brute force slow untuk large database.

**Solution**: Use ANN algorithms (FAISS, Annoy, ScaNN)

```python
import faiss

# Build index
dimension = 512
index = faiss.IndexFlatIP(dimension)  # Inner Product (for normalized vectors)
index.add(all_embeddings_matrix)  # (N×M) × 512

# Search
D, I = index.search(query_embedding, k=1)  # Find top-1
best_match_id = I[0][0]
```

**Speedup**: 100x faster (sub-millisecond)

**2. Quantization**

**Problem**: 512-d float32 = 2KB per embedding → memory intensive.

**Solution**: Quantize to lower precision

```python
# Product Quantization (PQ)
index = faiss.IndexPQ(dimension, 64, 8)  # 64 subquantizers, 8-bit

# Memory: 512 floats → 64 bytes (32x reduction)
# Speed: 10x faster (less data to process)
# Accuracy: ~99% retained
```

**3. Pre-filtering**

```python
# Filter by scheduled shift
today = date.today()
employees_on_shift = db.query(Employee).join(ScheduledShift).filter(
    ScheduledShift.tanggal == today
).all()

# Only match against employees expected today
# Speedup: 5-10x (fewer candidates)
```

**4. Caching**

```python
import redis

# Cache embeddings in Redis
r = redis.Redis()
r.set(f"emb:{employee_id}", pickle.dumps(embeddings))

# Faster access than DB query
```

**5. Parallel Processing**

```python
from concurrent.futures import ThreadPoolExecutor

def match_employee(employee):
    # ... matching logic ...
    return best_similarity, employee

with ThreadPoolExecutor(max_workers=4) as executor:
    results = executor.map(match_employee, employees)
    best = max(results, key=lambda x: x[0])
```

**Combined Approach**:
- Use FAISS for initial candidates (top 10)
- Refine with precise cosine similarity
- Cache frequently accessed data
- Pre-filter by context (shift, department)

**Result**: 1000+ employees → <500ms response time

---

Semoga dokumentasi ini membantu persiapan sidang Anda! 🎓
