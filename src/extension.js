'use strict';

const vscode = require('vscode');
const { getMatches, isUnicodePair, isUnicodeModifier, getSettings, curry } = require('./util');

let config;

const updateConfig = () =>
  (config = getSettings('js-unicode-preview', ['languages', 'inline', 'hover']));

const setUnicodeDecorators = (editor, type) => {
  if (!editor || !config.languages.includes(editor.document.languageId)) return;

  const text = editor.document.getText();
  const decorators = [];

  const addDecorator = ({ text, startPos, endPos }) => {
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

  const matchToNum = curry((base, [_, capture]) => parseInt(capture, base));

  const getDecoratorPosition = curry((base, match) => {
    const code = matchToNum(base, match);
    const startPos = match.index;
    const endPos = startPos + match[0].length;
    return { text: String.fromCodePoint(code), startPos, endPos };
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

  const getDecoratorPositionsForUnicodeCodePoints = match =>
    mergeModifiers(
      getMatches(/\\u\{([0-9A-Fa-f]+)\}/gu, match[0]).map(m => ({
        text: String.fromCodePoint(matchToNum(16, m)),
        startPos: match.index + m.index,
        endPos: match.index + m.index + m[0].length
      }))
    );

  const getDecoratorPositionsForUnicodePairs = match => {
    const chars = getMatches(/\\u([0-9A-Fa-f]{4})/gu, match[0]).map(matchToNum(16));
    const decorators = [];

    for (let i = 0; i < chars.length; i++) {
      const firstPair = chars[i];
      const secondPair = i < chars.length - 1 && chars[i + 1];
      const startPos = match.index + i * 6;
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
    return mergeModifiers(decorators);
  };

  [
    ...getMatches(/\\([0-7]{1,3})/gu, text).map(getDecoratorPosition(8)),
    ...getMatches(/\\x([0-9A-Fa-f]{2})/gu, text).map(getDecoratorPosition(16)),
    ...getMatches(/(?:\\u\{[0-9A-Fa-f]+\})+/gu, text)
      .map(getDecoratorPositionsForUnicodeCodePoints)
      .flat(),
    ...getMatches(/(?:\\u[0-9A-Fa-f]{4})+/gu, text)
      .map(getDecoratorPositionsForUnicodePairs)
      .flat()
  ].forEach(addDecorator);

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
