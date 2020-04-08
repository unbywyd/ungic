const inquirer = require('inquirer');

module.exports = async function(questions) {
    this.rl.toClose();
    var prompt = inquirer.createPromptModule();
    const ui = new inquirer.ui.Prompt((prompt).prompts, {});
    const rl = ui.rl
    rl.listeners("SIGINT").forEach(listener => rl.off("SIGINT", listener));
    let answers = await new Promise((resolve, reject) => {
        function handleCtrlC() {
            rl.off("SIGINT", handleCtrlC);
            ui.close();
            resolve(false);
        }
        rl.on("SIGINT", handleCtrlC);
        ui.run(questions).then(function(res, rej) {
            resolve(res);
        });
    });
    this.rl.begin();
    return answers;
}