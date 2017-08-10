var vscode = require('vscode');
var process = require('process');
var fs = require('fs');
var util = require('util');
var os = require('os');


var singleComment = 1;
var multiComment = 2;

function stripWithoutWhitespace() {
    return '';
}

function stripWithWhitespace(str, start, end) {
    return str.slice(start, end).replace(/\S/g, ' ');
}

function stripJSONComments(str, opts) {
    opts = opts || {};

    var currentChar;
    var nextChar;
    var insideString = false;
    var insideComment = false;
    var offset = 0;
    var ret = '';
    var strip = opts.whitespace === false ? stripWithoutWhitespace : stripWithWhitespace;

    for (var i = 0; i < str.length; i++) {
        currentChar = str[i];
        nextChar = str[i + 1];

        if (!insideComment && currentChar === '"') {
            var escaped = str[i - 1] === '\\' && str[i - 2] !== '\\';
            if (!escaped) {
                insideString = !insideString;
            }
        }

        if (insideString) {
            continue;
        }

        if (!insideComment && currentChar + nextChar === '//') {
            ret += str.slice(offset, i);
            offset = i;
            insideComment = singleComment;
            i++;
        } else if (insideComment === singleComment && currentChar + nextChar === '\r\n') {
            i++;
            insideComment = false;
            ret += strip(str, offset, i);
            offset = i;
            continue;
        } else if (insideComment === singleComment && currentChar === '\n') {
            insideComment = false;
            ret += strip(str, offset, i);
            offset = i;
        } else if (!insideComment && currentChar + nextChar === '/*') {
            ret += str.slice(offset, i);
            offset = i;
            insideComment = multiComment;
            i++;
            continue;
        } else if (insideComment === multiComment && currentChar + nextChar === '*/') {
            i++;
            insideComment = false;
            ret += strip(str, offset, i + 1);
            offset = i + 1;
            continue;
        }
    }

    return ret + (insideComment ? strip(str.substr(offset)) : str.substr(offset));
};


function activate(context) {

    var disposable = vscode.commands.registerCommand('extension.createSnippet', function () {
        var editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Cannot create snippet from empty string. Select some text first.");
            return;
        }

        var selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage("Cannot create snippet from empty string. Select some text first.");
            return;
        }
        var selectedText = editor.document.getText(selection);

        let snippetObject = {};
        vscode.languages.getLanguages()
            .then((vsCodeLangs) => {
                return vscode.window.showQuickPick
                    (
                    vsCodeLangs,
                    { placeHolder: vscode.window.activeTextEditor.document.languageId })
            }).then(language => {
                snippetObject.language = language;
                return vscode.window.showInputBox({
                    prompt: "Enter snippet name"
                })
            }).then((name) => {
                if (name === undefined) {
                    return;
                }
                snippetObject.name = name;
                return vscode.window.showInputBox({
                    prompt: "Enter snippet shortcut"
                })
            }).then((shortcut) => {
                if (shortcut === undefined)
                    return;
                snippetObject.shortcut = shortcut;
                return vscode.window.showInputBox({
                    prompt: "Enter snippet description"
                })
            }).then((description) => {
                if (description === undefined)
                    return;
                snippetObject.description = description;
            }).then(() => {
                var vsCodeUserSettingsPath;
                const osName = os.type();
                var delimiter = "/";
                var appName = vscode.env.appName;
                
                if(appName === "Visual Studio Code - Insiders") {
                    appExtensionPath = "Code - Insiders";
                } else {
                    appExtensionPath = "Code";
                }

                switch (osName) {
                    case ("Darwin"): {
                        vsCodeUserSettingsPath = process.env.HOME + "/Library/Application Support/" + appExtensionPath + "/User/";
                        break;
                    }
                    case ("Linux"): {
                        vsCodeUserSettingsPath = process.env.HOME + "/.config/" + appExtensionPath + "/User/";
                        break;
                    }
                    case ("Windows_NT"): {
                        vsCodeUserSettingsPath = process.env.APPDATA + "\\" + appExtensionPath + "\\User\\";
                        delimiter = "\\";
                        break;
                    }
                    default: {
                        //BSD?
                        vsCodeUserSettingsPath = process.env.HOME + "/.config/" + appExtensionPath + "/User/";
                        break;
                    }
                }

                var userSnippetsFile = vsCodeUserSettingsPath + util.format("snippets%s.json", delimiter + snippetObject.language);

                fs.readFile(userSnippetsFile, (err, text) => {
                    if (err) {
                        fs.open(userSnippetsFile, "w+", (err, fd) => {
                            if (err)
                                return;
                            else {
                                var snippets = {}
                                snippets[snippetObject.name] = {
                                    prefix: snippetObject.shortcut,
                                    body: buildBodyFromText(selectedText),
                                    description: snippetObject.description
                                }
                                var newText = JSON.stringify(snippets, null, '\t');
                                fs.writeFile(userSnippetsFile, newText, (err => {

                                }))
                            }
                        })
                    }
                    else {
                        var snippets = jsonFromText(text.toString());

                        if (snippets[snippetObject.name] !== undefined) {
                            vscode.window.showErrorMessage("Snippet with this name already exists");
                            return;
                        }
                        else {
                            snippets[snippetObject.name] = {
                                prefix: snippetObject.shortcut,
                                body: buildBodyFromText(selectedText),
                                description: snippetObject.description
                            }
                            var newText = JSON.stringify(snippets, null, '\t');
                            fs.writeFile(userSnippetsFile, newText, (err => {

                            }))
                        }
                    }
                });
            });

    });

    context.subscriptions.push(disposable);
}
exports.activate = activate;

function buildBodyFromText(text) {
    var fixed = text.replace(/\t/g, '\\t');
    return fixed.split("\n");
}

function jsonFromText(text) {
    var regexp = /"(\\.|[^"\\])*"/ig;
    var result;

    text = stripJSONComments(text, {whitespace: false});
        var out = text;
    while (result = regexp.exec(text)) {
        var substr = text.slice(result.index, regexp.lastIndex);
        var fixed = substr.replace(/\t/g, '\\t')
        out = out.substring(0, result.index) + fixed + text.substring(regexp.lastIndex);
    }

    return JSON.parse(out);
}

function deactivate() {
}
exports.deactivate = deactivate;