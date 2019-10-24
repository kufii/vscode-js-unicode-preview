'use strict';

const vscode = require('vscode');
const { getMatches, isUnicodePair, getSettings } = require('./util');

let config;

const updateConfig = () =>
  (config = getSettings('js-unicode-preview', ['languages', 'inline', 'hover']));

const setUnicodeDecorators = (editor, type) => {
  if (!editor || !config.languages.includes(editor.document.languageId)) return;

  const text = editor.document.getText();
  const decorators = [];

  const addDecorator = (text, startPos, endPos) => {
    decorators.push({
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
  };

  const addWithoutPairs = (base = 16) => match => {
    const code = parseInt(match[1], base);
    const startPos = match.index;
    const endPos = startPos + match[0].length;
    addDecorator(String.fromCodePoint(code), startPos, endPos);
  };
  const addHex = addWithoutPairs();
  const addOctal = addWithoutPairs(8);

  const addWithPairs = match => {
    const chars = getMatches(/\\u([0-9A-Fa-f]{4})/gu, match[0]).map(([_, hex]) =>
      parseInt(hex, 16)
    );

    for (let i = 0; i < chars.length; i++) {
      const firstPair = chars[i];
      const secondPair = i < chars.length - 1 && chars[i + 1];
      const startPos = match.index + i * 6;
      const endPos = startPos + 6;
      if (secondPair && isUnicodePair(firstPair, secondPair)) {
        addDecorator(String.fromCharCode(firstPair, secondPair), startPos, endPos + 6);
        i++;
      } else {
        addDecorator(String.fromCodePoint(firstPair), startPos, endPos);
      }
    }
  };

  getMatches(/\\u\{([0-9A-Fa-f]+)\}/gu, text).forEach(addHex);
  getMatches(/\\x([0-9A-Fa-f]{2})/gu, text).forEach(addHex);
  getMatches(/(?:\\u[0-9A-Fa-f]{4})+/gu, text).forEach(addWithPairs);
  getMatches(/\\([0-7]{1,3})/gu, text).forEach(addOctal);

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
  vscode.workspace.onDidChangeConfiguration(() => updateConfig(), null, context.subscriptions);
  context.subscriptions.push(new DecoratorProvider());
};
