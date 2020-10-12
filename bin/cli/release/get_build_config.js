const _ = require('underscore');
module.exports = function(plugin, build_name) {
	let build = plugin.builder.config;
	let releaseConfigs = build.release.configs;
	let releaseBuilds = build.release.build;
	let config = Object.assign({}, releaseConfigs.default);
	if(!releaseBuilds[build_name]) {
		build_name = 'default';
	}
	let hasBuildName = !!(releaseBuilds[build_name]);
	if (hasBuildName) {
	  config = _.extend(config, releaseBuilds[build_name]);
	  let configId = releaseBuilds[build_name].configId;
	  if (!releaseConfigs[configId]) {
	    this.logger.warning(`${configId} config is not specified in release configs for ${plugin.id} plugin. Default configuration will be used.`, 'CLI');
	  } else {
	    config = _.extend(config, releaseConfigs[configId]);
	  }
	} else {
		this.logger.warning(`${build_name} release is not specified for ${plugin.id} plugin. Default configuration will be used.`, 'CLI');
	}
	return config;
}