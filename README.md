# ذيب الديرة 🐺

لعبة ذئب/مستذئب (Werewolf) سعودية نجدية — عربية RTL، موبايل أولًا، بلا أي خادم مدفوع:
ملفات ثابتة على GitHub Pages + Firebase Realtime Database (خطة Spark المجانية) + دخول مجهول.

- **٥ – ١٤ لاعبًا**، الأدوار: ذيب الديرة 🐺 / العرّاف 👁 / الحكيم 🌿 / من أهل الديرة 🏠
- وضعان: **مجلس** (قعدة وحدة والجوال للأدوار والتصويت) و**أونلاين** (شات نصي بالنهار + تخطي AFK)
- الهوست يلعب مثل الجميع، وجهازه هو «سلطة اللعبة» (يحسم الليل ويقدّم المراحل) — بلا Cloud Functions

> المواصفة الكاملة في [SPEC.md](SPEC.md)، وقرارات التنفيذ غير المغطاة فيها موثقة في [DECISIONS.md](DECISIONS.md).

---

## الإطلاق (مرة واحدة)

### 1) قواعد قاعدة البيانات — إلزامية
من [Firebase Console](https://console.firebase.google.com/) → مشروع `wolf-1ec11` →
**Realtime Database → Rules** → الصق محتوى [`database.rules.json`](database.rules.json) → **Publish**.

بدون هذه الخطوة لن يعمل أي شيء (القاعدة الافتراضية ترفض كل قراءة/كتابة).

### 2) الدخول المجهول
**Authentication → Sign-in method → Anonymous → Enable** (مفعّل غالبًا — تحقق فقط).

### 3) GitHub Pages
ادفع المستودع إلى GitHub ثم: **Settings → Pages → Deploy from a branch → main / root**.
اللعبة تُفتح من `https://<user>.github.io/<repo>/` — لا خطوة بناء إطلاقًا.

---

## الأصول (اختيارية — اللعبة تعمل كاملة بدونها)

| المسار | الملفات المتوقعة | البديل عند الغياب |
|---|---|---|
| `assets/img/` | `logo.png, card-back.png, card-wolf.png, card-seer.png, card-doctor.png, card-villager.png, bg-night.png, bg-day.png, avatar-01..12.png` | شعار نصي، بطاقات ملونة بإيموجي، تدرجات CSS، إيموجي حيوانات |
| `assets/sfx/` | `wolf-howl.mp3, rooster.mp3, sword.mp3, drum.mp3, save.mp3, card-flip.mp3, win-village.mp3, win-wolves.mp3, night-wind.mp3` (CC0) | صمت — اللعبة لا تنتظر الصوت |

قواعد الصوت: يُفتح بعد أول لمسة (قيود الموبايل)؛ في وضع المجلس تصدح أصوات الأحداث من جهاز
الهوست فقط والشخصية محليًا؛ كتم 🔇 محفوظ في `localStorage`.

---

## التطوير محليًا

```bash
node tools/dev-server.mjs            # http://127.0.0.1:4173
```

اختبار كامل بقواعد مفروضة بدون لمس الإنتاج (يتطلب Java + Node):

```bash
npx -y firebase-tools@13 emulators:start --only auth,database --project demo-wolf
# ثم افتح: http://127.0.0.1:4173/index.html?emu
```

أعلام التطوير في الرابط: `?emu` يحوّل للمحاكي المحلي، `?fast` يقسم مؤقتات المراحل على ١٠.

## بنية الكود

```
index.html            الصدفة الوحيدة (SPA)
css/main.css          نظام التصميم كاملًا (شريط السدو، الثيمات، الانتقال ليل⇄نهار 1.5s)
js/main.js            الإقلاع + الراوتر (كل شاشة دالة نقية من لقطة الغرفة)
js/state.js           اشتراكات RTDB لكل عقدة حسب القواعد + إعادة الاشتراك الديناميكي
js/host-engine.js     سلطة الهوست: المؤقتات، حسم الليل، التصويت/الإعادة، الفوز، الإعادة
js/screens/*.js       home, lobby, reveal, night, report, day, vote, result
js/audio.js           WebAudio مع فشل صامت للملفات الغائبة
database.rules.json   مصدر الحقيقة لقواعد الأمان — أعد لصقه بعد أي تعديل
styleguide.html       دليل الهوية البصرية (تبويبات + عرض الانتقال)
```

## حدود أمنية مقصودة (MVP بلا خادم)

- جهاز الهوست يقرأ الأسرار كلها ليحسم الليل — الهوست لاعب **موثوق** بحكم التصميم.
- إخفاء حصيلة التصويت حتى اكتمالها سلوك واجهة فقط (القراءة تقنيًا متاحة للمصادقين).
- لا ترقية هوست عند انقطاعه — اللعبة تتوقف مؤقتًا وتُستأنف بعودته.
