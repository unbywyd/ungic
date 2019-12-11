module.exports = function(input, done) {
     return yargs = require("yargs")(input)
        .fail(function (msg, err, yargs) {
            console.log(msg);
            yargs.showHelp();
            if('function' == typeof done) {
                done();
            }
        })
        .version(false)
        .showHelpOnFail(true)
        .strict(true)
        .help(false)
        .exitProcess(false);
}