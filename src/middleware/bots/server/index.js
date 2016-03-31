const router = require(`koa-router`)();
const fs = require(`fs-promise`);
const path = require(`path`);
const _ = require(`underscore`);
const Promise = require(`bluebird`);

const botsRoutes = require(`./routes`);
const botModel = require(`./model/bot`);
const Bot = require(`./bot`);

/**
 * This is a Bots class representing all of the available hardware
 *
 * The bots are discovered or registered through this class and controlled by
 * the individual Bot class API
 *
 */
class Bots {
  /**
   * A bots server class
   * @param {Object} app - The parent Koa app.
   * @param {string} routeEndpoint - The relative endpoint.
   */
  constructor(app, routeEndpoint) {
    // Setup internal and external app references
    app.context.bots = this;
    this.app = app;

    // Setup logger and router
    this.logger = app.context.logger;
    this.routeEndpoint = routeEndpoint;
    this.router = router;

    // Initialize list of bots to be an empty object
    this.bots = {};
  }

  /**
   * initialize the bots endpoint
   */
  async initialize() {
    try {
      // Set up the router
      await this.setupRouter();

      // Set up the bot database model
      this.Bot = await botModel(this.app);
      let botsDbArray = await this.Bot.findAll();
      // If there are not bots saved yet, create one
      // This first bot object is where we will save settings for
      // generic usb bots that cannot be made persistent
      if (botsDbArray.length === 0) {
        const initialBotObject = {
          port: `null`,
          name: `Default`,
          jogXSpeed: `2000`,
          jogYSpeed: `2000`,
          jogZSpeed: `1000`,
          jogESpeed: `120`,
          tempE: `200`,
          tempB: `60`,
          speedRatio: `1.0`,
          eRatio: `1.0`,
          offsetX: `0`,
          offsetY: `0`,
          offsetZ: `0`,
        };
        await this.Bot.create(initialBotObject);
        // reload the botDbArray now that we have one
        botsDbArray = await this.Bot.findAll();
      }

      // Load all bots from the database and add them to the 'bots' object
      for (const dbBot of botsDbArray) {
        const botSettings = {};
        botSettings.port = dbBot.dataValues.port;
        botSettings.name = dbBot.dataValues.name;
        botSettings.jogXSpeed = dbBot.dataValues.jogXSpeed;
        botSettings.jogYSpeed = dbBot.dataValues.jogYSpeed;
        botSettings.jogZSpeed = dbBot.dataValues.jogZSpeed;
        botSettings.jogESpeed = dbBot.dataValues.jogESpeed;
        botSettings.tempE = dbBot.dataValues.tempE;
        botSettings.tempB = dbBot.dataValues.tempB;
        botSettings.speedRatio = dbBot.dataValues.speedRatio;
        botSettings.eRatio = dbBot.dataValues.eRatio;
        botSettings.offsetX = dbBot.dataValues.offsetX;
        botSettings.offsetY = dbBot.dataValues.offsetY;
        botSettings.offsetZ = dbBot.dataValues.offsetZ;

        // Create a bot object
        // The first bot object created will always be the serial port bot
        const botObject = new Bot(this.app, botSettings);
        this.bots[botSettings.port] = botObject;
      }

      // Start scanning for all bots
      await this.setupDiscovery();
      this.logger.info(`Bots instance initialized`);
    } catch (ex) {
      this.logger.error(`Bot initialization error`, ex);
    }
  }

  /*
   * get a json friendly description of the Bots
   */
  getBots() {
    const filteredBots = {};
    for (const bot in this.bots) {
      if (this.bots.hasOwnProperty(bot)) {
        filteredBots[bot] = this.bots[bot].getBot();
      }
    }
    return filteredBots;
  }

  /**
   * Set up the bot's instance's router
   */
  async setupRouter() {
    try {
      // Populate this.router with all routes
      // Then register all routes with the app
      await botsRoutes(this);

      // Register all router routes with the app
      this.app.use(this.router.routes()).use(this.router.allowedMethods());
      this.logger.info(`Bots router setup complete`);
    } catch (ex) {
      this.logger.error(`Bots router setup error`, ex);
    }
  }

  async setupDiscovery() {
    const discoveryDirectory = path.join(__dirname, `./discovery`);
    const discoveryTypes = await fs.readdir(discoveryDirectory);
    discoveryTypes.forEach((discoveryType) => {
      // Scan through all of the discovery types.
      // Make sure to ignore the source map files
      // TODO refactor in case helper files are necessary in the 'discovery' folder
      if (discoveryType.indexOf(`.map`) === -1) {
        const discoveryPath = path.join(__dirname, `./discovery/${discoveryType}`);
        const DiscoveryClass = require(discoveryPath);
        const discoveryObject = new DiscoveryClass(this.app);
        discoveryObject.initialize();
        this.logger.info(`${discoveryType.split(`.`)[0]} discovery initialized`);
      }
    });
  }
}

module.exports = Bots;
