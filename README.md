| Note: Its works stably for nodejs 12+ |
| --- |

# About ungic packer
Ungic packer is a web template development environment with modular [Dart Sass](https://sass-lang.com/dart-sass) framework and a set of tools for web coder.

Its purpose is to facilitate the preparation of materials to front-end, but rather, helps to solve the following tasks:
### Basic tasks
* To prepare a structure for the future web template
* To provide a local server for working with project files
* To provide live server
* To provide the necessary tools for web coder

### HTML preparation
* To provide the ability to partition pages to (**templates, html parts, markdown and text files**) for multiple inclusion in your project.
* To provide full-fledged work with popular template engines such as: **Handlebars, Mustache, Underscore, Pug**
* To provide work with dynamic data for templates (**JSON, YAML, QueryString, SCSS options - the possibility of a sass ungic framework**)
* To provide tools for debugging
* To provide helpers to quickly render icons and include static project files
* To provide html5 validation
* To provide AMP page validation
* To provide functionality of release implementation
* To provide html minification and optimization

### Web icons preparation
* To provide optimization SVG files
* To provide functionality for packaging icons into web fonts
* To provide functionality for packaging SVG icons into  SVG sprites
* To provide functionality to image processing and sprite generation
* To provide functionality to import and export icons
* To provide release implementation functionality

### CSS preparation / SASS framework
To work with css, i developed a sophisticated framework that allows you to write components quickly and use them in your projects, each component can interact with another component using its functionality, in addition to components, there are other features, the features of the framework will be listed below
* Based on Dart Sass
* Modularity concept and component implementation
* Styling a project and inheriting components of project styles
* Functionality for color inversion and automatic theme inversion
* Implementing themes and supporting multiple themes
* Full RTL support
* Postcss handling (**Autoprefix, cleancss, rtl-css, ungic plugins to export themes**)
* Export **scss options** to JSON and directly to html plugin for template generation
* Integration with an icon plugin (There are two virtual components sprites and font-icons which can be included in sass components)
* Release implementation

# Get started
* First, install the global library using npm **npm install ungic -g**
* Create an empty directory, go to the directory itself and perform the initial installation with **ungic init** command
* To get started you should run the development environment with **ungic run** command

## Commands list:
### Global commands
* **ungic --help** - It will returns the project version
* **ungic --version** - It will returns the packer version
* **ungic --log, -l** - Enable or disable logging to the console
* **ungic --mode, -m** - Providing the mode configuration. Manipulates NODE_ENV environment variable. [default: "development"]

### Commands after running a project
* **--help** - It will returns the help about the active menu
* **exit** -  Action back or exit
* **html** - Switch to html plugin menu
    * **valid <path>** - Check page from the dist directory using validator.w3.org
    * **amp_valid <path>** - Check page from the dist directory using amp-validator
    * **create <name>** - Create New Page
    * **release** - Create release
    * **pages** - Show pages
    * **unwatch** - Skip file changes for this plugin
    * **watch** - To watch file changes for this plugin
    * **remove <name>** - Remove page
* **icons** - Switch to icons plugin menu
    * **export** - Export svg icons to json file
    * **import** - Import svg icons from exported file
    * **release** - Create release
    * **unwatch**
    * **watch**
* **sass** - Switch to sass plugin menu
    * **create <cid>** - Create sass component
    * **release [name]** - Assemble components in a release
    * **components** - Show list of existing components
    * **remove <name>** - Remove component
    * **unwatch**
    * **watch**
* **other** - Switch to other menu
    * **install_demo** - Install demo content
    * **create_config** - Generate a configuration file if the project was initialized

## Documentation and other links
For more information you can visit the [project website](https://packer.ungic.com)

Project website: [packer.ungic.com](https://packer.ungic.com)

Source code in a [bitbucket](https://bitbucket.org/ungic/ungic-packer-public/src/master/)

NPM - **npm install ungic -g**

Author [unbywyd](mailto:unbywyd@gmail.com)


