export const addFlowSize = { width: 390, height: 844, deviceScaleFactor: 1 };
export const addFlowDuration = 2.8;

export async function openAddSheet(page) {
  await page.getByTestId("tab-add").click();
  await page.getByTestId("add-sheet").waitFor({ state: "visible" });
  await page.getByTestId("add-scan").waitFor({ state: "visible" });
  await page.getByTestId("add-upload").waitFor({ state: "visible" });
  await page.getByTestId("add-sheet").evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
}

export async function openReceiptCamera(page) {
  await page.getByTestId("add-scan").click();
  await page.waitForURL("**/scan");
  await page.getByTestId("fullscreen-camera").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-testid="fullscreen-camera"] video');
    return window.__receeboReceiptCameraReady === true
      && video?.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
  }, null, { timeout: 20000 });
}

export async function playAddFlow(page, poster) {
  await openAddSheet(page);
  await page.waitForTimeout(1200);
  await openReceiptCamera(page);
  await page.waitForTimeout(1000);
  await poster();
}
