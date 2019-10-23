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

  const addWithoutPairs = match => {
    const hex = parseInt(match[1], 16);
    const startPos = match.index;
    const endPos = startPos + match[0].length;
    addDecorator(String.fromCodePoint(hex), startPos, endPos);
  };

  const addWithPairs = match => {
    const chars = getMatches(/\\u([0-9A-Fa-f]{4})/gu, match[0]).map(([, hex]) => parseInt(hex, 16));

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

  getMatches(/\\u\{([0-9A-Fa-f]+)\}/gu, text).forEach(addWithoutPairs);
  getMatches(/\\x([0-9A-Fa-f]{2})/gu, text).forEach(addWithoutPairs);
  getMatches(/(?:\\u[0-9A-Fa-f]{4})+/gu, text).forEach(addWithPairs);

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
