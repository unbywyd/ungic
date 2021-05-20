const path = require('path');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');
const _ = require('underscore');
const prompts = require('../modules/prompt.js');
const colors = require('colors');
const intro = require('../modules/add-files-to-project');
const open = require('open');
let {bootstrap, demo, boilerplate} = require('./modules/install_packages');

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
    .command('bootstrap', 'Get started with bootstrap 5', () => {
    }, () => {
      done(bootstrap.bind(this));
    })
    .argv
}