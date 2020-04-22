let Timer = require('./timer.js');

let timer = new Timer();

timer.update();
timer.on('finish', () => {
    console.log('finished');
});