/**
 * Attribution & disclaimer copy for the app. Single source of truth so the
 * footer, first-run gate, "About the Data" page and print brief stay in sync.
 * Text is verbatim from the approved legal copy; only [App Name] is filled in.
 */

export const APP_NAME = "TX Hotel RevPAR Intelligence";

/** Block 1 — persistent footer (every screen). */
export const FOOTER_DISCLOSURE =
  "Data sourced from the Texas Comptroller of Public Accounts. Not affiliated " +
  "with, endorsed by, or sponsored by the State of Texas or the Comptroller's " +
  "office. Revenue and RevPAR figures are estimates derived from public filings.";

/** Block 2 — one-line credit for tight spaces (e.g. under a chart). */
export const ONE_LINE_CREDIT =
  "Source: Texas Comptroller of Public Accounts (public data). Figures are " +
  "derived estimates — not official.";

/** Block 4 — first-run / one-time acknowledgment modal body. */
export const FIRST_RUN_ACK =
  `${APP_NAME} shows estimated hotel revenue and RevPAR calculated from public ` +
  "Texas Comptroller filings. These are derived estimates, not official or " +
  "property-reported figures, and are provided for informational purposes only " +
  "— not as investment, financial, or professional advice.";

/** Block 3 — "About the Data" full sections. */
export const ABOUT_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Data source",
    body:
      "Figures in this app are built from Hotel Occupancy Tax data published by " +
      "the Texas Comptroller of Public Accounts, which the Comptroller makes " +
      "available to the public as public-domain information. This app is an " +
      "independent product. It is not affiliated with, endorsed by, sponsored by, " +
      "or reviewed by the State of Texas, the Texas Comptroller of Public " +
      "Accounts, or any government agency.",
  },
  {
    heading: "How the numbers are produced",
    body:
      `Room revenue, occupancy, and RevPAR values shown here are calculated by ` +
      `${APP_NAME} from public tax filings. They are estimates and derived ` +
      "metrics, not official figures reported by any property or agency. The " +
      "granularity of public filings varies, and some values are interpolated or " +
      "computed rather than reported directly. Actual property performance may " +
      "differ.",
  },
  {
    heading: "No warranty",
    body:
      "Data is provided “as is,” without warranty of any kind. The Texas " +
      "Comptroller does not guarantee the accuracy or completeness of the " +
      `underlying data, and neither does ${APP_NAME}. We are not liable for ` +
      "errors, omissions, or decisions made in reliance on this information.",
  },
  {
    heading: "Not professional advice",
    body:
      "Nothing in this app constitutes investment, financial, tax, legal, " +
      "appraisal, or underwriting advice. Do your own diligence and consult " +
      "qualified professionals before acting on any figure shown here.",
  },
  {
    heading: "Trademarks",
    body:
      "Hotel brand names, marks, and logos are the property of their respective " +
      "owners and are used for identification only; their appearance does not " +
      "imply any affiliation or endorsement.",
  },
];
