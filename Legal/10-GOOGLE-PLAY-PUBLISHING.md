# Google Play Console and Android App Publishing Plan (2026)

**Status:** Planning requirement, **not purchased or published**. Reviewed 28 October 2026.

## 1. This is not a subscription
Google Play Console charges **US$25 one time** for a developer account. No standard recurring annual or monthly Play Console registration subscription. **Lean planning allocation: ₦40,000 one time**, covering US$25 at an illustrative ₦1,350/USD (₦33,750) and a small FX/card/payment buffer. This allowance is a model input, not a verified charge. Official: https://support.google.com/googleplay/android-developer/answer/6112435

## 2. Account holder: ChombuTar company, not individual shareholders
The three parties agreed that the new ChombuTar operating company should own platform IP, brand and operating assets. Therefore create a **Play Console Organization developer account in the company's legal name once CAC registration and the requisite Google organization identity checks are complete.** Avoid registration in a founder, investor or technical vendor's private account for convenience. Record approved primary account owner, financial owner, backups, 2FA, published support contacts, developer access roles and app signing-key management in company registers.

Google requires an organization D-U-N-S number, legal organization name/address, website, organization phone, verified developer and contact information and Google payments profile. D-U-N-S application is free but can take several weeks. Start verification early. https://support.google.com/googleplay/android-developer/answer/13628312

## 3. Development and app-store readiness
Current repo is a React/Vite PWA with Vercel serverless APIs, not proof of an existing Android App Bundle. Package and test a compliant Android **AAB** (e.g. Trusted Web Activity where appropriate or tested native wrapper) without assuming the web app is automatically publishable. For new Android phone apps/updates from 31 August 2026, target Android 16 **API 36** or higher. https://support.google.com/googleplay/android-developer/answer/11926878

App release testing: Android camera + microphone permissions; foreground/background behavior; WebRTC Live streaming and TURN on physical Android phones; file uploads/video export; secure login; push notifications; supported payment and wallet flows; deep links; Work Pass QR scans and verification; crashes; offline experiences; release signing/keystore recovery; privacy permission prompts and consent; content moderation, ratings and support flows.

## 4. Mandatory Google Play declarations and user controls
Create accurate store listing (description, icon, screenshots, app category, support contacts); content rating; applicable media, permissions and advertising declarations; publicly accessible **Privacy Policy**, truthful **Data safety** declarations matching actual SDK data collection and sharing; in-app AND web-based account deletion request path and appropriate deletion exceptions. Verify requirements and precise forms in the developer console. https://support.google.com/googleplay/android-developer/answer/13327111

## 5. Payments: distinguish service bookings from digital in-app items
Google Play Billing generally applies to paid **in-app digital goods, cloud services, paid features and subscriptions** unless an applicable exemption or program permits a different method. It **must not be used** for qualifying real-world physical goods and services; peer-to-peer transactions and certain other categories also have distinct rules. Thus a physical tailor/plumber booking, a digital app boost, subscription, in-app credit, and digital-only service are not assumed to be equivalent. A Paystack checkout should be evaluated for each use case before Google Play publishing. Where applicable, digital features may require Play Billing and its transaction fees (not included in this fixed lean budget). https://support.google.com/googleplay/android-developer/answer/9858738

## 6. Testing and launch
Google Play internal/closed testing is appropriate for the user-planned December 2026 beta. **New personal developer accounts** created after 13 November 2023 must have at least 12 opted-in testers for 14 continuous days before requesting production access. That specific restriction applies to new **personal accounts**; do not assume the identical threshold applies to the recommended organization account. https://support.google.com/googleplay/android-developer/answer/14151465

Play Console processing and store-review time are not guaranteed; the planned closed web/PWA beta can remain independent if safely launched, but a Google Play-distributed beta requires the Android and Console readiness steps.

## 7. Financial effect
| Metric | Previous | Revised |
|---|---:|---:|
| One-time launch costs | ₦800,000 | **₦840,000** |
| Monthly operating | ₦485,000 | **₦485,000** |
| Six-month opex | ₦2,910,000 | **₦2,910,000** |
| Pre-contingency cash need | ₦3,710,000 | **₦3,750,000** |
| 20% contingency | ₦742,000 | **₦750,000** |
| Minimum operating funding | ₦4,452,000 | **₦4,500,000** |
| Lean target for discussion | ₦5,000,000 | **₦5,000,000** |
| Target less required funding | ₦548,000 | **₦500,000** |

This assumes Android packaging and Play listing work can be performed within the **existing ₦200,000 security/QA allocation and Silabs technical agreement**, without a separately charged contractor; confirm with Silabs. Future Google Play Billing fees for digital items, content ratings and special paid services are **not** included.

## 8. Status and accountable owners
- CAC incorporation and company legal identity — **Management / counsel: in progress**.
- D-U-N-S application and business verification — **Management: not confirmed**.
- Console signup and one-time fee — **Management: not paid**.
- Android AAB, signing and target API 36 — **Silabs: not verified**.
- Data safety, app content, web/in-app account deletion — **Product + counsel: not verified**.
- Billing/Paystack policy categorization — **Finance + counsel: not verified**.
- Closed beta Google Play release — **Management + Silabs: contingent on gates**.

**Account ownership instruction:** the future operating company should have durable administrative and recovery control. Merely sharing a personal Google password with the three parties is not an acceptable governance arrangement.
