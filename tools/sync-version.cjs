#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packageInfo = require('../package.json');
const appinfo = require('../assets/appinfo.json');

fs.writeFileSync(
  path.join(__dirname, '..', 'assets', 'appinfo.json'),
  `${JSON.stringify(
    {
      ...appinfo,
      version: packageInfo.version
    },
    null,
    2
  )}\n`
);
