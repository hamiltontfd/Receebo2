import { sendSignupNotification } from "../lib/signupNotify";

// No database, Clerk, signup, trial or Meta imports. One explicit fictional email only.
if (process.env.NODE_ENV !== "development") {
  console.error("This notification test requires NODE_ENV=development");
  process.exitCode = 1;
} else {
  const result = await sendSignupNotification({
    at: new Date(), email: "teste@exemplo.com", loginMethod: "e-mail",
    market: "US", country: "US", utmSource: "reddit",
    utmCampaign: "US_Reddit_Test_2026-11", utmContent: "R1", hasFbclid: true,
  });
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
