const inquirer = require('inquirer');

module.exports = function(questions) {
  return new Promise((resolve, reject) => {  
    try {
      var prompt = inquirer.createPromptModule();
      const ui = new inquirer.ui.Prompt((prompt).prompts, {});
      const rl = ui.rl
      rl.listeners("SIGINT").forEach(listener => rl.off("SIGINT", listener));     
      function handleCtrlC() {
          rl.off("SIGINT", handleCtrlC);
          ui.close();
          resolve(false);
      }
      rl.on("SIGINT", handleCtrlC);
      ui.run(questions).then(function(res, rej) {            
          resolve(res);
      });
    } catch(e) {
      console.log(e);
    }
  });
}