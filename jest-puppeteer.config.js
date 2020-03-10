module.exports = {
  server: {
    command: `npm start`,
    port: 3000,
    launchTimeout: 60000
  },
  launch: {
    headless: process.env.HEADLESS === "false" ? false : true,
    slowMo: 50
  }
};
