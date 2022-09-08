let {bootstrap, demo, boilerplate, bootstrapVue} = require('./modules/install_packages');

module.exports = function (yargs, done) {
  yargs
    .command('demo', 'Get started with demo project', () => {
    }, () => {
     done(demo.bind(this)); 
    })
    .command('boilerplate', 'Get started with boilerplate', () => {
    }, () => {
     done(boilerplate.bind(this));
    })
    .command('bootstrap4', 'Get started with bootstrap 4', () => {
    }, () => {
      done(bootstrap.bind(this, {v:4}));
    })
    .command('bootstrapVue', 'Get started with bootstrap vue', () => {
    }, () => {
      done(bootstrapVue.bind(this));
    })
    .command('bootstrap5', 'Get started with bootstrap 5 (Required sass 1.32 or sass migration)', () => {
    }, () => {
      done(bootstrap.bind(this));
    })
    .argv
}