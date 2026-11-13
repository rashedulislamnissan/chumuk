// Dev-only: loads the brand fonts for tools/storyart.mjs, which injects and screenshots the story SVGs.
import "@fontsource/fraunces/700.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/tiro-bangla/400.css";

await document.fonts.ready;
await Promise.all([
  document.fonts.load('700 26px "Fraunces"'),
  document.fonts.load('700 17px "DM Sans"'),
  document.fonts.load('600 13px "DM Sans"'),
  document.fonts.load('400 64px "Tiro Bangla"', "চুমুক ০৭"),
]);
(window as unknown as { __fontsReady: boolean }).__fontsReady = true;
