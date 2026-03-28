# Monad Quiz & Vote Sistemi — Mimari Kararlar

> Bu döküman, sistemin tasarım sürecinde alınan kararları, gerekçelerini ve teknik detaylarını kayıt altına alır. Kod yazılmadan önce referans noktası olarak kullanılmalıdır.

---

## 1. Genel Bakış

Proje, Monad ağı üzerinde çalışan iki modülden oluşuyor: **Quiz** ve **Vote**. Her iki modül de lobi tabanlı bir yapıya sahip — her quiz veya oylama oturumu bağımsız bir akıllı kontrat olarak deploy edilir ve bir **owner node** tarafından yönetilir.

### Temel prensipler

Sistemin tamamı üç fikir üzerine inşa edilmiştir:

**Trustless (güvensiz ortamda güven):** Katılımcılar owner'a körü körüne güvenmek zorunda kalmamalı. Tüm kritik kararlar — cevap doğrulama, anahtar geçerliliği, soru sırası — zincir üzerinde doğrulanabilir olmalı.

**Progressive disclosure (kademeli açıklama):** Katılımcılar yalnızca sırası gelen soruyu görebilmeli. Henüz açılmamış sorular şifreli tutulur; anahtar zincire yazılana kadar içerik kimse tarafından okunamaz.

**Monad'ın paralel execution avantajından yararlanmak:** Farklı lobiler için gelen transaction'lar birbirini bloklamaz. Bu, bağımsız kontrat yapısıyla doğrudan sağlanır.

---

## 2. Kontrat Mimarisi

### 2.1 LobbyFactory

Tüm lobilerin tek giriş noktası. Her yeni quiz veya vote isteğinde bağımsız bir kontrat deploy eder. Bu sayede lobilerin state'leri birbirini etkilemez ve Monad'ın paralel execution'ı farklı lobiler üzerinde etkin şekilde çalışır.

### 2.2 QuizLobby

Her quiz oturumu için ayrı deploy edilen kontrat. Commit-reveal mekanizmasını, soru sırasını (`currentQuestion` sayacı), anahtar doğrulamasını ve katılımcı üyeliğini yönetir. Detayları aşağıdaki bölümlerde ele alınmıştır.

### 2.3 VoteLobby

Her oylama oturumu için ayrı deploy edilen kontrat. QuizLobby ile ayrı tutulur çünkü ikisinin commit-reveal kullanma *gerekçesi* farklıdır ve şifreleme ihtiyacı yoktur.

Oylama seçenekleri (adaylar, öneriler vb.) baştan herkese açık olduğundan AES şifrelemesine veya HKDF anahtar türetmeye gerek yoktur — saklayacak bir "soru içeriği" bulunmaz. Bununla birlikte oylar da commit-reveal ile gönderilir; ancak buradaki motivasyon front-running değil, **sosyal etki**yi önlemektir. Eğer oylar anlık görünseydi, erken oy alan bir aday kararsız katılımcıları sürü psikolojisiyle etkileyebilirdi. Oylar yalnızca oylama sona erdikten sonra toplu olarak açıklanır; böylece herkes bağımsız karar verir.

### 2.4 AnswerVault

Şifreli cevap hash'lerini tutan yardımcı kontrat. QuizLobby ile aynı deploy sürecinde oluşturulur.

### 2.5 ScoreBoard

Quiz tamamlandıktan sonra katılımcıların cevaplarını açıklanan doğru cevaplarla karşılaştırarak puan hesaplar ve zincire yazar.

---

## 3. Veri Depolama Kararı: On-chain vs Off-chain

### Karar: Soru metinleri IPFS'te, commit'ler on-chain

Soru metinlerini doğrudan zincire yazmak iki ciddi sorun yaratır. Birincisi, 50 soruluk bir quizde string olarak on-chain yazmak aşırı gas maliyeti anlamına gelir. İkincisi ve daha önemlisi, şifreleme olmadan yazılmış sorular `eth_getStorageAt` ile quiz başlamadan okunabilir — hatta `private` keyword'ü bunu engellemez.

Bu nedenle şu hibrit yapı benimsenmiştir:

- **IPFS:** Şifreli soru + cevap paketleri (`enc(Q_i, K_i)`) buraya yüklenir.
- **Monad:** IPFS içeriğinin parmak izi olan CID ve her sorunun anahtar commit'leri (`keccak256(K_i)`) on-chain tutulur.

Bu yapı sayesinde kimse IPFS'teki içeriği manipüle edemez — içerik değişirse CID de değişir, zincirdeki CID ile eşleşmez ve fark anında anlaşılır.

### IPFS pinleme stratejisi

IPFS bir depolama garantisi vermez; dosyayı tutan node'lar unpin ederse içerik kaybolabilir. Quiz yalnızca 1 saat sürdüğü için bu risk yönetilebilir, ancak şu strateji önerilir: quiz aktifken **Pinata** veya **web3.storage** ile pinle, quiz tamamlanıp sonuçlar kesinleştikten sonra gerekirse **Arweave**'e yedekle.

---

## 4. Şifreleme Mimarisi

### 4.1 Motivasyon

Katılımcının sırası henüz gelmemiş soruları okuyamaması gerekiyor. Bu bir UI kararı gibi görünse de, IPFS herkese açık bir ağ olduğundan CID'yi bilen herkes içeriğe doğrudan ulaşabilir. Dolayısıyla soru metinleri mutlaka şifreli tutulmalı ve anahtarlar ancak sırası geldiğinde zincire yazılmalıdır.

### 4.2 Algoritma: AES-256-GCM

Her soru `AES-256-GCM` ile şifrelenir. GCM modu hem şifreleme hem de bütünlük doğrulaması sağlar — şifreli içeriğin kısmi olarak değiştirilmesi tespit edilebilir.

### 4.3 Anahtar türetme: HKDF ile tek master'dan

Owner'ın 50 soru için 50 ayrı anahtar üretmesi ve saklaması gerekmez. Bunun yerine tek bir `masterKey` (32 byte random) üretilir ve her soru için deterministik olarak bir alt anahtar türetilir:

```
K_i = HKDF(masterKey, "question-" + i)
```

`HKDF` (HMAC-based Key Derivation Function) kriptografik açıdan tek yönlüdür: `K_1`'i bilen biri `K_2`'yi hesaplayamaz. Owner sadece `masterKey`'i saklar; tüm soru anahtarları bundan yeniden türetilebilir.

### 4.4 IPFS payload formatı

```json
{
  "quizId": "0xabc...",
  "questions": [
    {
      "index": 0,
      "encryptedPayload": "base64(AES-GCM(soru_metni + cevap_hash, K0, iv0))",
      "iv": "base64(iv0)"
    },
    {
      "index": 1,
      "encryptedPayload": "base64(AES-GCM(soru_metni + cevap_hash, K1, iv1))",
      "iv": "base64(iv1)"
    }
  ]
}
```

Her sorunun kendi IV'si (initialization vector) vardır. AES-GCM güvenlik şartı gereği, aynı anahtar ile bile aynı IV iki kez kullanılmamalıdır.

---

## 5. Commit-Reveal Mekanizması

Commit-reveal, blockchain'deki klasik bir şifreleme pattern'ıdır. Temel fikir şudur: veriyi açıklamadan önce onun hash'ini zincire yaz (commit), doğru zamanda orijinal veriyi yayınla (reveal), herkes `hash(yayınlanan_veri) == commit` kontrol etsin.

### Quiz başlangıcında (commit aşaması)

Owner şunları zincire yazar:
1. IPFS CID (şifreli soruların parmak izi)
2. Her soru anahtarı için commit: `keccak256(K_i)` — `i = 0..n-1`

Bu noktada kimse gerçek `K_i` değerlerini bilmez; sadece hash'leri zincirde görünür.

### Soru açılırken (reveal aşaması)

Her sorunun süresi dolduğunda `revealKey(i, K_i)` çağrılır. Kontrat şunu doğrular:

```
keccak256(K_i) == keyCommits[i]  →  anahtar gerçek
currentQuestion == i             →  sıralı açılıyor
block.timestamp >= questionStartTime[i] + QUESTION_DURATION  →  süre dolmuş
```

Üç koşul da sağlanırsa `K_i` zincire yazılır, katılımcının frontend'i event'i dinler, IPFS'teki şifreli soruyu çözer ve ekrana basar.

---

## 6. Trustless Soru Geçişi

### Kritik karar: Soru süresi deploy anında sabitlenir

Owner `LobbyFactory` üzerinden yeni bir quiz oluştururken `questionDuration` ve `revealWindow` parametrelerini geçer. Bu değerler kontrat constructor'ında zincire yazılır ve sonradan değiştirilemez. Böylece katılımcılar quiz başlamadan önce her sorunun ne kadar süreceğini ve quiz sonunda kaç dakika reveal yapabileceklerini zincirden okuyarak doğrulayabilir.

```solidity
constructor(
    uint256 _questionCount,
    uint256 _questionDuration,  // saniye cinsinden, örn. 300 = 5 dakika
    uint256 _revealWindow,      // saniye cinsinden, örn. 600 = 10 dakika
    bytes32[] memory _keyCommits,
    bytes32 _ipfsCID
) {
    questionCount    = _questionCount;
    questionDuration = _questionDuration;
    revealWindow     = _revealWindow;
    // ...
}
```

### Kritik karar: `revealKey` herkes tarafından çağrılabilir

Süre dolduğunda `revealKey` fonksiyonunu yalnızca owner değil, **herhangi biri** çağırabilir. Bu, sistemin önemli bir güvenlik özelliğidir: owner interneti kesse, cihazı arızalansa veya kasıtlı olarak süreci durdursa bile herhangi bir katılımcı bir sonraki soruyu açabilir.

Bu yapı, owner'a olan güven gereksinimini minimize eder. Owner'ın tek tekeline sahip olduğu şey `masterKey` ve dolayısıyla `K_i` değerleridir — bu anahtarları yalnızca o bilir, dolayısıyla soruyu açacak veriyi yalnızca o sağlayabilir. Ancak "süreci devam ettirme" yetkisi herkestededir.

### Solidity taslağı

```solidity
function revealKey(uint256 questionIndex, bytes32 key) external {
    // Sıralı açılma zorunlu — Q2 açılmadan Q3 açılamaz
    require(questionIndex == currentQuestion, "sira disi acma");

    // Süre kontrolü — herhangi biri çağırabilir, ama zamanı gelmemişse reddedilir
    require(
        block.timestamp >= questionStartTime[questionIndex] + QUESTION_DURATION,
        "sure dolmadi"
    );

    // Anahtar doğrulama — commit ile eşleşiyor mu?
    require(
        keccak256(abi.encodePacked(key)) == keyCommits[questionIndex],
        "yanlis anahtar"
    );

    revealedKeys[questionIndex] = key;
    currentQuestion++;
    questionStartTime[questionIndex + 1] = block.timestamp;

    // Frontend bu event'i dinler ve soruyu çözer
    emit QuestionRevealed(questionIndex, key);
}
```

# Sorular bittikten sonra
Sorular bittikten sonra, owner eğer cevap anahtarı key'ini yayınlamazsa en başta verdiği stake, tüm katılımcılara dağılır.
stake de quizden quize değişebilecek bir parametre olmalı.

---

## 7. Katılımcı Akışı

### 7.1 Neden katılımcı tarafında da commit-reveal gerekli?

Bir transaction zincire yazılmadan önce **mempool**'da kısa süre bekler — bu, henüz onaylanmamış transaction'ların tutulduğu herkese açık geçici havuzdur. Eğer katılımcılar cevaplarını düz metin olarak gönderseydi, başka biri mempool'u izleyerek o cevabı kopyalayıp daha yüksek gas ile önce zincire yazdırabilirdi. Bu klasik bir **front-running** saldırısıdır.

Çözüm, katılımcıların da commit-reveal uygulamasıdır: katılımcı önce gerçek cevabın hash'ini gönderir, quiz tamamen bitince cevabı ve salt'ı açıklar.

### 7.2 Salt neden zorunlu?

Cevap seçenekleri sınırlıdır ("A", "B", "C", "D"). Salt olmadan bir saldırgan her seçeneği hash'leyip commit ile karşılaştırabilir — bu **rainbow table** saldırısıdır. `keccak256("A" + rastgele_32_byte)` değerini önceden hesaplamak ise mümkün değildir; salt bu kapıyı kapatır.

### 7.3 Akış adımları

Katılımcı önce `joinLobby()` çağırarak zincire üyelik kaydı düşürür. Kontrat, cevap geldiğinde "bu kişi gerçekten bu lobinin üyesi mi?" kontrolünü bu kayıt sayesinde yapabilir.

Her soru aktifken katılımcı `commitAnswer(questionIndex, keccak256(cevap + salt))` çağırır. Mempool'da yalnızca anlamsız bir hash görünür; cevap gizlidir.

Quiz tamamen bittikten sonra bir **reveal window** açılır (örneğin 10 dakika). Katılımcı bu pencere içinde `revealAnswer(questionIndex, cevap, salt)` çağırarak tüm cevaplarını toplu olarak açıklar. Reveal window tercih olarak quiz sonuna konulmuştur — her soru sonrası anlık reveal, birinin açıklamasını geciktirerek başkalarının cevabını görmesine ve ardından reveal yapmasına olanak tanırdı.

Window içinde reveal yapmayan katılımcıların commit'leri geçersiz sayılır.

### 7.4 Solidity taslağı

```solidity
// Aşama 1: Quiz sırasında — sadece hash gönderilir
function commitAnswer(uint256 questionIndex, bytes32 commitment) external {
    require(isMember[msg.sender], "lobi uyesi degil");
    require(questionIndex == currentQuestion, "sira disi");
    require(commitments[msg.sender][questionIndex] == bytes32(0), "zaten commit edildi");

    // Mempool'da sadece bu hash görünür, gerçek cevap gizlidir
    commitments[msg.sender][questionIndex] = commitment;
    emit AnswerCommitted(msg.sender, questionIndex);
}

// Aşama 2: Quiz bittikten sonra — tüm cevaplar toplu açıklanır
function revealAnswer(uint256 questionIndex, string calldata answer, bytes32 salt) external {
    require(phase == Phase.REVEAL, "henuz reveal asamasi degil");
    require(block.timestamp <= revealDeadline, "reveal suresi doldu");

    // Commit ile eşleşiyor mu?
    bytes32 expected = keccak256(abi.encodePacked(answer, salt));
    require(expected == commitments[msg.sender][questionIndex], "yanlis cevap veya salt");

    revealedAnswers[msg.sender][questionIndex] = answer;
    emit AnswerRevealed(msg.sender, questionIndex, answer);
}
```

### 7.5 Skorlama

Reveal window kapandıktan sonra `ScoreBoard`, her katılımcının açıklanan cevaplarını owner tarafından reveal edilmiş doğru cevaplarla karşılaştırır ve sonuçları zincire yazar.

---

## 8. Performans Değerlendirmesi (Salon Kapasitesi)

Sistemin birkaç yüz kişiyi handle etmesi beklenmektedir. Yük dağılımı şöyle planlanmıştır:

**Zincire giden tek transaction (düşük yük):** Her soru geçişinde yalnızca bir `revealKey` çağrısı yapılır. Bu, 500 kişinin aynı anda zinciri meşgul etmesi anlamına gelmez.

**IPFS + client-side şifre çözme (yüksek yük ama off-chain):** Anahtar yayınlandığında 500 katılımcının tamamı IPFS'ten aynı soruyu çeker ve kendi cihazlarında şifre çözer. Bu işlem tamamen paralel, zinciri hiç ilgilendirmiyor.

**Katılımcı commit'leri (paralel transaction'lar):** Monad'ın paralel execution özelliği burada devreye girer. Farklı katılımcıların `commitAnswer` çağrıları bağımsız hesaplar üzerinde işlem yaptığından paralel olarak işlenebilir. Commit aşamasında zincire sadece 32 byte'lık bir hash yazıldığından gas maliyeti de minimumdur.

**Reveal window yükü:** Quiz sonunda tüm katılımcılar kısa bir pencerede `revealAnswer` çağırır. Bu, kısa süreli bir transaction yoğunluğu yaratır. Monad'ın yüksek TPS kapasitesi sayesinde birkaç yüz katılımcının eş zamanlı reveal'ı sorunsuz karşılanabilir.

---

## 9. Açık Kalan Kararlar

Aşağıdaki sorular henüz netleştirilmemiş olup implementasyon başlamadan önce yanıtlanmalıdır:

- Token ödülü mekanizması olacak mı, yoksa saf skor tablosu yeterli mi?
- Frontend hangi kütüphane ile Monad'a bağlanacak? (ethers.js / viem)

---

## 10. Teknoloji Özeti

| Katman | Teknoloji | Gerekçe |
|---|---|---|
| Blockchain | Monad (EVM) | Paralel execution, yüksek TPS |
| Kontrat dili | Solidity | EVM uyumluluğu |
| Şifreleme | AES-256-GCM | Hız + bütünlük doğrulaması |
| Anahtar türetme | HKDF | Deterministik, tek master'dan N anahtar |
| Commit mekanizması | keccak256 | Native EVM desteği, gaz açısından ucuz |
| Depolama | IPFS + pinleme servisi | İçerik adresleme, manipülasyon kanıtlanabilir |
| Frontend bağlantısı | ethers.js veya viem | TBD |
