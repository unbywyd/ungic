module.exports = function(input) {
  let self = this;
  return yargs = require("yargs")(input)
    .fail(function (msg, err, yargs) {
        self.logger.system(msg, 'CLI');
        yargs.showHelp();
    })
    .version(false)
    .showHelpOnFail(true)
    .strict(true)
    .help(false)
    .exitProcess(false);
}