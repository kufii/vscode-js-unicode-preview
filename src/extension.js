'use strict';

const vscode = require('vscode');
const { getMatches, isUnicodePair, isUnicodeModifier, getSettings, curry } = require('./util');

let config;

const updateConfig = () =>
  (config = getSettings('js-unicode-preview', ['languages', 'inline', 'hover']));

const setUnicodeDecorators = (editor, type) => {
  if (!editor || !config.languages.includes(editor.document.languageId)) return;

  const toDecorator = ({ text, startPos, endPos }) => ({
    range: new vscode.Range(
      editor.document.positionAt(startPos),
      editor.document.positionAt(endPos)
    ),
    ...(config.hover && { hoverMessage: text }),
    ...(config.inline && {
      renderOptions: {
        after: {
          contentText: text,
          color: 'rgba(255, 255, 255, 0.55)'
        }
      }
    })
  });

  const mergeModifiers = decorators => {
    let current;
    const merged = [];
    decorators.forEach(d => {
      if (!current) current = d;
      else if (isUnicodeModifier(d.text)) {
        current.endPos = d.endPos;
        current.text += d.text;
      } else {
        merged.push(current);
        current = d;
      }
    });
    merged.push(current);
    return merged;
  };

  const matchToNum = curry((base, [_, group]) => parseInt(group, base));

  const processNoPairs = curry((base, match, index) => {
    const text = String.fromCodePoint(matchToNum(base, match));
    const startPos = index;
    const endPos = index + match[0].length;
    return { text, startPos, endPos };
  });
  const processHex = processNoPairs(16);
  const processOctal = processNoPairs(8);

  const processWithPairs = (str, index) => {
    const chars = getMatches(/\\u([0-9A-Fa-f]{4})/gu, str).map(matchToNum(16));
    const decorators = [];

    for (let i = 0; i < chars.length; i++) {
      const firstPair = chars[i];
      const secondPair = i < chars.length - 1 && chars[i + 1];
      const startPos = index + i * 6;
      const endPos = startPos + 6;
      if (secondPair && isUnicodePair(firstPair, secondPair)) {
        decorators.push({
          text: String.fromCharCode(firstPair, secondPair),
          startPos,
          endPos: endPos + 6
        });
        i++;
      } else {
        decorators.push({ text: String.fromCodePoint(firstPair), startPos, endPos });
      }
    }

    return decorators;
  };

  const processSet = match => {
    const parts = match[0]
      .split(/(\\[0-7]{1,3}|\\x[0-9A-Fa-f]{2}|(?:\\u[0-9A-Fa-f]{4})+|\\u\{[0-9A-Fa-f]+\})/u)
      .filter(Boolean);
    let index = match.index + match[1].length;
    const decorators = [];
    for (const part of parts) {
      let match = part.match(/\\([0-7]{1,3})/u);
      if (match) decorators.push(processOctal(match, index));
      match = part.match(/\\x([0-9A-Fa-f]{2})/u);
      if (match) decorators.push(processHex(match, index));
      match = part.match(/\\u[0-9A-Fa-f]{4}/u);
      if (match) decorators.push(...processWithPairs(part, index));
      match = part.match(/\\u\{([0-9A-Fa-f]+)\}/u);
      if (match) decorators.push(processHex(match, index));
      index += part.length;
    }
    return mergeModifiers(decorators);
  };

  const decorators = getMatches(
    /((?<!\\)(?:(\\\\)*))(?:\\x[0-9A-Fa-f]{2}|\\u[0-9A-Fa-f]{4}|\\u\{[0-9A-Fa-f]+\}|\\[0-2][0-7]{0,2}|\\3[0-6][0-7]?|\\37[0-7]?|\\[4-7][0-7]?)+/gu,
    editor.document.getText()
  )
    .map(processSet)
    .flat()
    .map(toDecorator);

  editor.setDecorations(type, decorators);
};

class DecoratorProvider extends vscode.Disposable {
  constructor() {
    super(() => this.dispose());
    this.disposables = [];
    this.timeout = null;
    this.activeEditor = vscode.window.activeTextEditor;
    this.decorationType = vscode.window.createTextEditorDecorationType({});
    setUnicodeDecorators(this.activeEditor, this.decorationType);

    vscode.window.onDidChangeActiveTextEditor(
      editor => {
        this.activeEditor = editor;
        updateConfig();
        editor && this.triggerUpdateDecorations();
      },
      this,
      this.disposables
    );

    vscode.workspace.onDidChangeTextDocument(
      event =>
        this.activeEditor &&
        event.document === this.activeEditor.document &&
        this.triggerUpdateDecorations(),
      this,
      this.disposables
    );
  }

  dispose() {
    let d;
    while ((d = this.disposables.pop())) d.dispose();
  }

  triggerUpdateDecorations() {
    if (this.timeout) return;
    this.timeout = setTimeout(() => {
      setUnicodeDecorators(this.activeEditor, this.decorationType);
      this.timeout = null;
    }, 300);
  }
}

module.exports.activate = context => {
  updateConfig();
  vscode.workspace.onDidChangeConfiguration(updateConfig, null, context.subscriptions);
  context.subscriptions.push(new DecoratorProvider());
};
