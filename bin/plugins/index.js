const skeleton = require('../modules/skeleton');
const path = require('path');
const fg = require('fast-glob');
const _ = require('underscore');
const merge = require('deepmerge');

class ungicPlugin extends skeleton {
    constructor(privateScheme={}, modelConfig={}, sysconfig={}) {
        let commonScheme = require('./model-scheme');

        super(merge(Object.assign({}, commonScheme), privateScheme, {
            arrayMerge: (destinationArray, sourceArray) => _.union(destinationArray, sourceArray)
        }), {objectMerge: true}, modelConfig);
        let config = this.config;
        this.project = sysconfig.project;
        this.id = config.id;
        this.root = path.join(this.project.root, config.fs.dirs.source, config.fs.source[this.id]);
        this.dist = path.join(this.project.root, config.fs.dirs.dist);
        this.relativePath = path.normalize(path.join(config.fs.dirs.source, config.fs.source[this.id])).replace(/(^\/|\/$)+/, '');
    }
    watch() {
        if(this.unwatched) {
            fg('**/*', {cwd: this.root}).then(() => {
                this.project.watcher.add(this.root);
                this.project.watcher.add(path.join(this.root, '*'));
                this.project.watcher.add(path.join(this.root, '**/*'));
            }).catch(e => {
                console.log(e);
            });
            this.unwatched = false;
            this.project.watch(this);
        }
    }
    log(message, type="log", args={}) {
        if(message instanceof Error) {
            type = 'error';
            message = message.message;
        }
        args.plugin_id = this.id;
        this._events.emit('log', type, message, args);
    }
    error(message, args={}) {
        args.plugin_id = this.id;
        this.log(message, 'error', args);
    }
    system(message, message_type = 'system', args={}) {
        args.message_type = message_type;
        this.log(message, 'system', args);
    }
    warning(message, args={}) {
        args.plugin_id = this.id;
        this.log(message, 'warning', args);
    }
    unwatch() {
        if(!this.unwatched) {
            this.project.watcher.unwatch(this.root);
            this.project.watcher.unwatch(path.join(this.root, '*'));
            this.project.watcher.unwatch(path.join(this.root, '**/*'));
            this.project.unwatch(this);
            this.unwatched = true;
        }
    }
}


module.exports = ungicPlugin;