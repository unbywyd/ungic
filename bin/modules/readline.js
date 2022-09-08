let yargs = require('./yargs');
function ungicReadline(callback, options={}) {
  this.options = options;
  this.prefix = 'ungic: ';
  let context = this.options.context;
  if(this.options.prefix) {
      this.prefix = `ungic ${this.options.prefix}: `;
  }
  this.data = {
      input: process.stdin,
      output: process.stdout,
      prompt: this.prefix
  }
  this.open = () => {
    try {
      this.rl = require('readline').createInterface(this.data);
      this.rl.on('line', input => {       
        if(input.replace(/[\s\n]+/gm, '') == '') {
          context.logger.warning('Please enter a command.', 'CLI');      
          return this.rl.prompt();
        } else {      
          let _yargs = yargs.call(context, input);

          _yargs.command('exit', 'Exit from ungic', yargs => {}, args => {
            // Close command
            this.close().then(() => {
              process.exit(0);
            });
          });
          if(this.options.backCallback) {
            _yargs.command('back', 'Back to main menu', yargs => {}, args => {
              this.close().then(()=> {
                this.options.backCallback();
              });
            });
          }          
          callback.call(this, _yargs).then(() => {           
            if(!this.closed) {
              this.rl.prompt();
            }
          });
        }       

      });
      this.rl.prompt();
      this.closed = false;
    } catch(e) {
      console.log(e);
    }
  }
  this.open();

  this.next = () => {
    if(!this.closed) {
      this.rl.prompt();
    }
  }
  this.close = () => {
    this.closed = true;
    return new Promise((res, rej) => {
      try {
        let close = () => {           
          this.rl.off('close', close); 
          res();                    
        }
        this.rl.on('close', close).close();    
      } catch(e) {
        console.log(e);
      }
    });
  }
  this.pause = () => {
    return new Promise((res, rej) => {
      setTimeout(() => {    
        let pause = () => {      
          this.rl.off('pause', pause);
          res();
        }
        this.rl.on('pause', pause);    
        this.rl.pause();
      }, 100);
    });
  }
  this.resume = () => {
    return new Promise((res, rej) => {
      setTimeout(() => {       
        let resume = () => {      
          this.rl.off('resume', resume);
          res();
        }
        this.rl.on('resume', resume);    
        this.rl.resume();
      }, 100);
    });
  }
  return this
}


module.exports = ungicReadline;