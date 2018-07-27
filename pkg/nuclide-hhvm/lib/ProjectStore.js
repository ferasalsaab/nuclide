/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {DebugMode} from './types';

import {Emitter} from 'atom';
import {BehaviorSubject} from 'rxjs';

// eslint-disable-next-line nuclide-internal/no-cross-atom-imports
import {isFileInHackProject} from '../../nuclide-hack/lib/HackLanguage';
import {trackTiming} from '../../nuclide-analytics';
import nuclideUri from 'nuclide-commons/nuclideUri';
import UniversalDisposable from 'nuclide-commons/UniversalDisposable';

export default class ProjectStore {
  _disposables: UniversalDisposable;
  _emitter: Emitter;
  _currentFilePath: string;
  _projectRoot: BehaviorSubject<?string>;
  _isHHVMProject: ?boolean;
  _debugMode: DebugMode;
  _filePathsToScriptCommand: Map<string, string>;
  _stickyCommand: string;
  _useTerminal: boolean;
  _scriptArguments: string;

  constructor() {
    this._emitter = new Emitter();
    this._currentFilePath = '';
    this._projectRoot = new BehaviorSubject();
    this._isHHVMProject = null;
    this._debugMode = 'webserver';
    this._filePathsToScriptCommand = new Map();
    this._stickyCommand = '';
    this._useTerminal = false;
    this._scriptArguments = '';

    const onDidChange = this._onDidChangeActivePaneItem.bind(this);
    this._disposables = new UniversalDisposable(
      this._projectRoot
        .do(() => {
          // Set the project type to a "loading" state.
          this._isHHVMProject = null;
          this._emitter.emit('change');
        })
        .switchMap(root => this._isFileHHVMProject(root))
        .subscribe(isHHVM => {
          this._isHHVMProject = isHHVM;
          this._emitter.emit('change');
        }),
      atom.workspace.onDidStopChangingActivePaneItem(onDidChange),
    );
    onDidChange();
  }

  _onDidChangeActivePaneItem(): void {
    const activeTextEditor = atom.workspace.getActiveTextEditor();
    if (!activeTextEditor) {
      return;
    }

    const fileName = activeTextEditor.getPath();
    // flowlint-next-line sketchy-null-string:off
    if (!fileName) {
      return;
    }
    this._currentFilePath = fileName;
    this._emitter.emit('change');
  }

  _isFileHHVMProject(fileUri: ?string): Promise<boolean> {
    return trackTiming('toolbar.isFileHHVMProject', async () => {
      return (
        fileUri != null &&
        (nuclideUri.isRemote(fileUri) || process.platform !== 'win32') &&
        isFileInHackProject(fileUri)
      );
    });
  }

  getLastScriptCommand(filePath: string): string {
    const command = this._filePathsToScriptCommand.get(filePath);
    if (command != null) {
      return command;
    }
    return '';
  }

  updateLastScriptCommand(command: string): void {
    this._filePathsToScriptCommand.set(
      nuclideUri.getPath(this._currentFilePath),
      command,
    );
  }

  onChange(callback: () => void): IDisposable {
    return this._emitter.on('change', callback);
  }

  getCurrentFilePath(): string {
    return this._currentFilePath;
  }

  setProjectRoot(root: ?string): void {
    this._projectRoot.next(root);
  }

  getProjectRoot(): ?string {
    return this._projectRoot.getValue();
  }

  isHHVMProject(): ?boolean {
    return this._isHHVMProject;
  }

  getDebugMode(): DebugMode {
    return this._debugMode;
  }

  setDebugMode(debugMode: DebugMode): void {
    this._debugMode = debugMode;
    this._emitter.emit('change');
  }

  setScriptArguments(args: string): void {
    this._scriptArguments = args;
  }

  getScriptArguments(): string {
    return this._scriptArguments;
  }

  setStickyCommand(command: string, sticky: boolean): void {
    if (sticky) {
      this._stickyCommand = command;
    } else {
      const activeTextEditor = atom.workspace.getActiveTextEditor();
      if (!activeTextEditor || !activeTextEditor.getPath()) {
        this._currentFilePath = command;
      }
      this._stickyCommand = '';
    }
  }

  setUseTerminal(useTerminal: boolean): void {
    this._useTerminal = useTerminal;
  }

  getUseTerminal(): boolean {
    return this._useTerminal;
  }

  getDebugTarget(): string {
    const filePath = this._currentFilePath;
    if (this._debugMode !== 'webserver') {
      if (this._stickyCommand !== '') {
        return this._stickyCommand;
      }
      const localPath = nuclideUri.getPath(filePath);
      const lastScriptCommand = this.getLastScriptCommand(localPath);
      return lastScriptCommand === '' ? localPath : lastScriptCommand;
    }

    const rootPath = this._projectRoot.getValue();
    if (rootPath != null && nuclideUri.isRemote(rootPath)) {
      return nuclideUri.getHostname(rootPath);
    }
    return 'localhost';
  }

  dispose() {
    this._disposables.dispose();
  }
}
