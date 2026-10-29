// Single source for the privacy policy: rendered in-app (src/app/privacy.tsx) and exported to
// docs/privacy/index.html + store/privacy-policy.html by scripts/gen-store-assets.mts.
export const PRIVACY = {
  app: 'BizSwap Gurgaon',
  effective: '29 October 2026',
  contact: 'jayvasani8112005@gmail.com',
  url: 'https://jay0085-cdr.github.io/bizswap-gurgaon/privacy/',
  sections: [
    {
      h: 'Who we are',
      p: [
        'BizSwap Gurgaon (“we”) is a marketplace app that helps owners of running businesses in Gurgaon (Gurugram), India — such as pubs, restaurants, clinics and CA/CS practices — find buyers, and helps buyers find businesses. This MVP is operated by an individual developer as part of an internship assignment.',
      ],
    },
    {
      h: 'What we collect',
      p: [
        'Anonymous account: when you open the app we create an anonymous account identifier and a random install ID. We do not ask for your name and you do not need to sign up.',
        'What you tell our assistant: the messages you type or speak about the business you want to sell or buy (for example type, area, footfall, billing, rent, clients, budget). Voice is converted to text on your device; we receive only the text, never audio.',
        'Usage data: screens opened, searches and filters used, listings viewed, matches shown and buttons tapped, with timestamps.',
        'Feedback and diagnostics: feedback you choose to send from the app (with the app version and screen name), and technical error reports if a screen fails, so we can fix problems.',
        'Optional contact details: if you choose to share a mobile number or email, we store it so we can notify you about matches and so sellers you express interest in can reach you. This is optional.',
        'We do not collect your location, contacts, photos, files or advertising ID. The only device permission the app may request is the microphone, and only when you tap the mic button.',
      ],
    },
    {
      h: 'How we use it',
      p: [
        'To turn your description into a structured, anonymised listing or buyer requirement; to estimate an indicative valuation; to match buyers and sellers; to show your dashboards and inbox; to notify you about new matches if you opted in; and to improve the service.',
        'Listings shown publicly never include your name, phone, email or exact address, and map pins are deliberately offset by a few hundred metres.',
      ],
    },
    {
      h: 'AI processing',
      p: [
        'Your messages are processed by AI agents running on our servers (Supabase Edge Functions), which send the text to a third-party large-language-model provider (currently Google Gemini) to extract details, write listing text, estimate valuations and score matches. Under free-tier terms the provider may use submitted content to improve its services; please do not include sensitive personal information (such as health records of patients or client identities) in your messages.',
      ],
    },
    {
      h: 'Where data is stored & who we share it with',
      p: [
        'Data is stored in a Supabase (PostgreSQL) database. Service providers: Supabase (hosting and database), Google (AI processing), OpenFreeMap/OpenStreetMap (map tiles — your device requests map images directly). We do not sell your data and do not use it for advertising.',
        'When you tap “I’m interested” on a listing, the seller is notified anonymously. Your contact details are shared with that seller only if you have provided them.',
      ],
    },
    {
      h: 'Retention & deletion',
      p: [
        'We keep data while your anonymous account exists. You can delete all of your data at any time from Settings → Delete my data, which permanently removes your account, chats, listings, searches, matches and contact details. You can also email us to request deletion.',
      ],
    },
    {
      h: 'Children',
      p: ['The app is intended for adults (18+) engaged in business transactions and is not directed at children.'],
    },
    {
      h: 'Disclaimer',
      p: [
        'Valuations are indicative estimates generated automatically and are not financial advice. Demo listings marked “fictional” are sample data. Always do your own due diligence.',
      ],
    },
    {
      h: 'Changes & contact',
      p: ['We may update this policy; the effective date above will change. Questions or deletion requests: contact us at the email below.'],
    },
  ],
};
