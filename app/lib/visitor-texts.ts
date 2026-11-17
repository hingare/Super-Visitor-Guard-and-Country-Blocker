import { DEFAULT_HEADER, DEFAULT_MESSAGE } from "./block-handling";

// What storefront visitors read, in their own language: the default block
// page text, the browser check page and the geolocation redirect offer. A
// header or message the merchant wrote is shown as written.

export interface VisitorTexts {
  header: string;
  message: string;
  checkTitle: string;
  checkNote: string;
  geoText: string;
  geoGo: string;
  geoStay: string;
}

const TEXTS: Record<string, VisitorTexts> = {
  en: {
    header: DEFAULT_HEADER,
    message: DEFAULT_MESSAGE,
    checkTitle: "Checking your browser",
    checkNote: "This takes a few seconds. You will be taken to the store automatically.",
    geoText: "We have a store for your region. Would you like to go there?",
    geoGo: "Go to store",
    geoStay: "Stay here",
  },
  es: {
    header: "Acceso denegado",
    message:
      "Lo sentimos, actualmente no tienes los permisos necesarios para acceder a este sitio, o es posible que este sitio no esté disponible en tu región.",
    checkTitle: "Comprobando tu navegador",
    checkNote: "Esto tarda unos segundos. Te llevaremos a la tienda automáticamente.",
    geoText: "Tenemos una tienda para tu región. ¿Quieres ir allí?",
    geoGo: "Ir a la tienda",
    geoStay: "Quedarme aquí",
  },
  fr: {
    header: "Accès refusé",
    message:
      "Désolé, vous ne disposez pas actuellement des autorisations nécessaires pour accéder à ce site, ou ce site n'est peut-être pas disponible dans votre région.",
    checkTitle: "Vérification de votre navigateur",
    checkNote: "Cela prend quelques secondes. Vous serez redirigé vers la boutique automatiquement.",
    geoText: "Nous avons une boutique pour votre région. Voulez-vous y aller ?",
    geoGo: "Aller à la boutique",
    geoStay: "Rester ici",
  },
  de: {
    header: "Zugriff verweigert",
    message:
      "Leider haben Sie derzeit nicht die erforderlichen Berechtigungen, um auf diese Website zuzugreifen, oder diese Website ist in Ihrer Region möglicherweise nicht verfügbar.",
    checkTitle: "Ihr Browser wird überprüft",
    checkNote: "Das dauert nur wenige Sekunden. Sie werden automatisch zum Shop weitergeleitet.",
    geoText: "Wir haben einen Shop für Ihre Region. Möchten Sie dorthin wechseln?",
    geoGo: "Zum Shop",
    geoStay: "Hier bleiben",
  },
  it: {
    header: "Accesso negato",
    message:
      "Spiacenti, al momento non disponi delle autorizzazioni necessarie per accedere a questo sito, oppure il sito potrebbe non essere disponibile nella tua area geografica.",
    checkTitle: "Verifica del browser in corso",
    checkNote: "Ci vorranno pochi secondi. Verrai indirizzato al negozio automaticamente.",
    geoText: "Abbiamo un negozio per la tua area geografica. Vuoi andarci?",
    geoGo: "Vai al negozio",
    geoStay: "Resta qui",
  },
  pt: {
    header: "Acesso negado",
    message:
      "Desculpe, no momento você não tem as permissões necessárias para acessar este site, ou este site pode não estar disponível na sua região.",
    checkTitle: "Verificando seu navegador",
    checkNote: "Isso leva alguns segundos. Você será levado à loja automaticamente.",
    geoText: "Temos uma loja para a sua região. Deseja ir para lá?",
    geoGo: "Ir para a loja",
    geoStay: "Ficar aqui",
  },
  nl: {
    header: "Toegang geweigerd",
    message:
      "Sorry, je hebt momenteel niet de benodigde rechten om deze site te bezoeken, of deze site is mogelijk niet beschikbaar in jouw regio.",
    checkTitle: "Je browser wordt gecontroleerd",
    checkNote: "Dit duurt een paar seconden. Je wordt automatisch naar de winkel gebracht.",
    geoText: "We hebben een winkel voor jouw regio. Wil je daarheen gaan?",
    geoGo: "Naar de winkel",
    geoStay: "Hier blijven",
  },
  pl: {
    header: "Odmowa dostępu",
    message:
      "Przepraszamy, obecnie nie masz uprawnień niezbędnych do korzystania z tej witryny lub witryna może być niedostępna w Twoim regionie.",
    checkTitle: "Sprawdzanie przeglądarki",
    checkNote: "To potrwa kilka sekund. Zostaniesz automatycznie przeniesiony do sklepu.",
    geoText: "Mamy sklep dla Twojego regionu. Czy chcesz do niego przejść?",
    geoGo: "Przejdź do sklepu",
    geoStay: "Zostań tutaj",
  },
  tr: {
    header: "Erişim reddedildi",
    message:
      "Üzgünüz, şu anda bu siteye erişmek için gerekli izinlere sahip değilsiniz veya bu site bölgenizde kullanılamıyor olabilir.",
    checkTitle: "Tarayıcınız kontrol ediliyor",
    checkNote: "Bu birkaç saniye sürer. Mağazaya otomatik olarak yönlendirileceksiniz.",
    geoText: "Bölgeniz için bir mağazamız var. Oraya gitmek ister misiniz?",
    geoGo: "Mağazaya git",
    geoStay: "Burada kal",
  },
  ru: {
    header: "Доступ запрещён",
    message:
      "К сожалению, у вас сейчас нет необходимых прав для доступа к этому сайту, или сайт может быть недоступен в вашем регионе.",
    checkTitle: "Проверяем ваш браузер",
    checkNote: "Это займёт несколько секунд. Вы автоматически перейдёте в магазин.",
    geoText: "У нас есть магазин для вашего региона. Хотите перейти туда?",
    geoGo: "Перейти в магазин",
    geoStay: "Остаться здесь",
  },
  uk: {
    header: "Доступ заборонено",
    message:
      "На жаль, зараз у вас немає необхідних прав для доступу до цього сайту, або сайт може бути недоступний у вашому регіоні.",
    checkTitle: "Перевіряємо ваш браузер",
    checkNote: "Це займе кілька секунд. Ви автоматично перейдете до магазину.",
    geoText: "У нас є магазин для вашого регіону. Бажаєте перейти туди?",
    geoGo: "Перейти до магазину",
    geoStay: "Залишитися тут",
  },
  ar: {
    header: "تم رفض الوصول",
    message:
      "عذرًا، ليست لديك حاليًا الأذونات اللازمة للوصول إلى هذا الموقع، أو قد لا يكون هذا الموقع متاحًا في منطقتك.",
    checkTitle: "جارٍ التحقق من متصفحك",
    checkNote: "يستغرق هذا بضع ثوانٍ. سيتم نقلك إلى المتجر تلقائيًا.",
    geoText: "لدينا متجر لمنطقتك. هل تريد الانتقال إليه؟",
    geoGo: "الذهاب إلى المتجر",
    geoStay: "البقاء هنا",
  },
  hi: {
    header: "पहुँच अस्वीकृत",
    message:
      "क्षमा करें, इस साइट तक पहुँचने के लिए अभी आपके पास आवश्यक अनुमतियाँ नहीं हैं, या यह साइट आपके क्षेत्र में उपलब्ध नहीं हो सकती है।",
    checkTitle: "आपके ब्राउज़र की जाँच की जा रही है",
    checkNote: "इसमें कुछ सेकंड लगते हैं। आपको अपने-आप स्टोर पर ले जाया जाएगा।",
    geoText: "हमारे पास आपके क्षेत्र के लिए एक स्टोर है। क्या आप वहाँ जाना चाहेंगे?",
    geoGo: "स्टोर पर जाएँ",
    geoStay: "यहीं रहें",
  },
  bn: {
    header: "প্রবেশাধিকার নেই",
    message:
      "দুঃখিত, এই সাইটে প্রবেশের জন্য এই মুহূর্তে আপনার প্রয়োজনীয় অনুমতি নেই, অথবা সাইটটি আপনার অঞ্চলে উপলব্ধ নাও হতে পারে।",
    checkTitle: "আপনার ব্রাউজার যাচাই করা হচ্ছে",
    checkNote: "এতে কয়েক সেকেন্ড লাগবে। আপনাকে স্বয়ংক্রিয়ভাবে স্টোরে নিয়ে যাওয়া হবে।",
    geoText: "আপনার অঞ্চলের জন্য আমাদের একটি স্টোর আছে। আপনি কি সেখানে যেতে চান?",
    geoGo: "স্টোরে যান",
    geoStay: "এখানেই থাকুন",
  },
  "zh-CN": {
    header: "访问被拒绝",
    message: "抱歉，您目前没有访问此网站所需的权限，或者此网站在您所在的地区可能不可用。",
    checkTitle: "正在检查您的浏览器",
    checkNote: "这需要几秒钟。您将被自动带到商店。",
    geoText: "我们有面向您所在地区的商店。要前往吗？",
    geoGo: "前往商店",
    geoStay: "留在此处",
  },
  "zh-TW": {
    header: "拒絕存取",
    message: "抱歉，您目前沒有存取此網站所需的權限，或此網站在您所在的地區可能無法使用。",
    checkTitle: "正在檢查您的瀏覽器",
    checkNote: "這需要幾秒鐘。您將自動前往商店。",
    geoText: "我們有適用於您所在地區的商店。要前往嗎？",
    geoGo: "前往商店",
    geoStay: "留在這裡",
  },
  ja: {
    header: "アクセスが拒否されました",
    message:
      "申し訳ありませんが、現在このサイトにアクセスするために必要な権限がないか、お住まいの地域ではこのサイトをご利用いただけない可能性があります。",
    checkTitle: "ブラウザを確認しています",
    checkNote: "数秒で完了します。自動的にストアへ移動します。",
    geoText: "お住まいの地域向けのストアがあります。移動しますか？",
    geoGo: "ストアへ移動",
    geoStay: "このページにとどまる",
  },
  ko: {
    header: "액세스가 거부되었습니다",
    message:
      "죄송합니다. 현재 이 사이트에 접근하는 데 필요한 권한이 없거나, 이 사이트를 귀하의 지역에서 이용하지 못할 수 있습니다.",
    checkTitle: "브라우저를 확인하는 중입니다",
    checkNote: "몇 초 정도 걸립니다. 자동으로 스토어로 이동합니다.",
    geoText: "귀하의 지역을 위한 스토어가 있습니다. 이동하시겠습니까?",
    geoGo: "스토어로 이동",
    geoStay: "여기에 머물기",
  },
  id: {
    header: "Akses ditolak",
    message:
      "Maaf, saat ini Anda tidak memiliki izin yang diperlukan untuk mengakses situs ini, atau situs ini mungkin tidak tersedia di wilayah Anda.",
    checkTitle: "Memeriksa browser Anda",
    checkNote: "Ini memerlukan beberapa detik. Anda akan dibawa ke toko secara otomatis.",
    geoText: "Kami punya toko untuk wilayah Anda. Ingin ke sana?",
    geoGo: "Ke toko",
    geoStay: "Tetap di sini",
  },
};

export const VISITOR_LANGUAGES = Object.keys(TEXTS);
const RTL = new Set(["ar"]);

// The first supported language in a list of BCP 47 tags, most preferred
// first (navigator.languages, then the store's own language).
export function pickLanguage(tags: string): string {
  for (const raw of tags.split(",").slice(0, 10)) {
    const tag = raw.trim().replace(/_/g, "-").toLowerCase();
    if (!tag) continue;
    const [primary] = tag.split("-");
    if (primary === "zh") {
      return /-(tw|hk|mo|hant)\b/.test(tag) ? "zh-TW" : "zh-CN";
    }
    if (TEXTS[primary]) return primary;
  }
  return "en";
}

export function visitorTexts(language: string): VisitorTexts & { lang: string; dir: "ltr" | "rtl" } {
  const lang = TEXTS[language] ? language : "en";
  return { ...TEXTS[lang], lang, dir: RTL.has(lang) ? "rtl" : "ltr" };
}

// The merchant's own header and message stay as written; the defaults are
// shown in the visitor's language.
export function localizeBlockText(header: string, message: string, language: string) {
  const texts = visitorTexts(language);
  return {
    header: header === DEFAULT_HEADER ? texts.header : header,
    message: message === DEFAULT_MESSAGE ? texts.message : message,
  };
}

export function countryNameIn(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
