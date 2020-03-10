module.exports = {
  // server: {
  //   command: `npm run start:e2e`,
  //   port: 7777,
  //   launchTimeout: 60000
  // },
  launch: {
    headless: process.env.HEADLESS === "false" ? false : true,
    slowMo: 0
  }
};
