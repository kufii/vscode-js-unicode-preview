'use strict';

const vscode = require('vscode');

const regexSymbolWithCombiningMarks = /(\P{Mark})(\p{Mark}+)/gu;
const regexSurrogatePair = /([\uD800-\uDBFF])([\uDC00-\uDFFF])/g; // eslint-disable-line

const isUnicodePair = (hex1, hex2) =>
  String.fromCharCode(hex1, hex2).match(regexSymbolWithCombiningMarks) ||
  String.fromCharCode(hex1, hex2).match(regexSurrogatePair);

const getMatches = (regex, str) => {
  const matches = [];
  let match;
  while ((match = regex.exec(str))) {
    matches.push(match);
  }
  return matches;
};

const getSettings = (group, keys) => {
  const settings = vscode.workspace.getConfiguration(group, null);
  const editor = vscode.window.activeTextEditor;
  const language = editor && editor.document && editor.document.languageId;
  const languageSettings =
    language && vscode.workspace.getConfiguration(null, null).get(`[${language}]`);
  return keys.reduce((acc, k) => {
    acc[k] = languageSettings && languageSettings[`${group}.${k}`];
    if (acc[k] == null) acc[k] = settings.get(k);
    return acc;
  }, {});
};

module.exports = { isUnicodePair, getMatches, getSettings };
