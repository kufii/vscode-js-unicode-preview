'use strict';

const vscode = require('vscode');

const regexSurrogatePair = /([\uD800-\uDBFF])([\uDC00-\uDFFF])/; // eslint-disable-line
const regexModifier = /\p{Modifier_Symbol}|\p{Mark}/iu;

const isUnicodePair = (hex1, hex2) => regexSurrogatePair.test(String.fromCharCode(hex1, hex2));

const isUnicodeModifier = char => regexModifier.test(char);

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

const curry = fn => (...args) =>
  args.length < fn.length ? curry(fn.bind(null, ...args)) : fn(...args);

module.exports = { isUnicodePair, isUnicodeModifier, getMatches, getSettings, curry };
