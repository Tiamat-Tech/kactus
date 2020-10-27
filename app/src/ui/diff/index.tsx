import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { encodePathAsUrl } from '../../lib/path'

import { Repository } from '../../models/repository'
import {
  CommittedFileChange,
  WorkingDirectoryFileChange,
  AppFileStatusKind,
  isManualConflict,
  isConflictedFileStatus,
} from '../../models/status'
import {
  DiffSelection,
  DiffType,
  IDiff,
  ISketchDiff,
  IKactusFileType,
  ITextDiffData,
  IVisualTextDiffData,
  ITextDiff,
  ILargeTextDiff,
  ImageDiffType,
} from '../../models/diff'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { Button } from '../lib/button'
import { ImageDiff } from './image-diffs'
import { ConflictedSketchDiff } from './conflicted-sketch-diff'
import { BinaryFile } from './binary-file'
import { TextDiff } from './text-diff'
import { SideBySideDiff } from './side-by-side-diff'
import {
  enableExperimentalDiffViewer,
  enableSideBySideDiffs,
} from '../../lib/feature-flag'

// image used when no diff is displayed
const NoDiffImage = encodePathAsUrl(__dirname, 'static/ufo-alert.svg')

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

/** The props for the Diff component. */
interface IDiffProps {
  readonly repository: Repository

  /**
   * Whether the diff is readonly, e.g., displaying a historical diff, or the
   * diff's lines can be selected, e.g., displaying a change in the working
   * directory.
   */
  readonly readOnly: boolean

  /** The file whose diff should be displayed. */
  readonly file: ChangedFile | null

  /** Called when the includedness of lines or a range of lines has changed. */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /** The diff that should be rendered */
  readonly diff: IDiff

  readonly openSketchFile?: () => void

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType

  /** Hiding whitespace in diff. */
  readonly hideWhitespaceInDiff: boolean

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Whether we should show a confirmation dialog when the user discards changes */
  readonly askForConfirmationOnDiscardChanges?: boolean

  /**
   * Called when the user requests to open a binary file in an the
   * system-assigned application for said file type.
   */
  readonly onOpenBinaryFile: (fullPath: string) => void

  /**
   * Called when the user is viewing an image diff and requests
   * to change the diff presentation mode.
   */
  readonly onChangeImageDiffType: (type: ImageDiffType) => void

  /*
   * Called when the user wants to discard a selection of the diff.
   * Only applicable when readOnly is false.
   */
  readonly onDiscardChanges?: (
    diff: ITextDiffData,
    diffSelection: DiffSelection
  ) => void

  readonly onResolveConflict?: (
    repository: Repository,
    file: WorkingDirectoryFileChange,
    option: ManualConflictResolution
  ) => void
}

interface IDiffState {
  readonly forceShowLargeDiff: boolean
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, IDiffState> {
  public constructor(props: IDiffProps) {
    super(props)

    this.state = {
      forceShowLargeDiff: false,
    }
  }

  private onPickOurs = () => {
    if (
      !(this.props.file instanceof WorkingDirectoryFileChange) ||
      !this.props.onResolveConflict
    ) {
      log.error('This can not be happening...')
      return
    }
    this.props.onResolveConflict(
      this.props.repository,
      this.props.file,
      ManualConflictResolution.ours
    )
  }

  private onPickTheirs = () => {
    if (
      !(this.props.file instanceof WorkingDirectoryFileChange) ||
      !this.props.onResolveConflict
    ) {
      log.error('This can not be happening...')
      return
    }
    this.props.onResolveConflict(
      this.props.repository,
      this.props.file,
      ManualConflictResolution.theirs
    )
  }

  private renderSketchConflictedDiff(diff: ISketchDiff) {
    return (
      <ConflictedSketchDiff
        onChangeDiffType={this.props.onChangeImageDiffType}
        diffType={this.props.imageDiffType}
        current={diff.current!}
        previous={diff.previous!}
        text={diff.text}
        hunks={diff.hunks}
        onPickOurs={this.onPickOurs}
        onPickTheirs={this.onPickTheirs}
        repository={this.props.repository}
        readOnly={this.props.readOnly}
        file={this.props.file}
      />
    )
  }

  private renderImage(diff: IVisualTextDiffData) {
    return (
      <ImageDiff
        repository={this.props.repository}
        readOnly={this.props.readOnly}
        file={this.props.file}
        current={diff.current!}
        previous={diff.previous!}
        text={diff.text}
        hunks={diff.hunks}
        onIncludeChanged={this.props.onIncludeChanged}
        onChangeImageDiffType={this.props.onChangeImageDiffType}
        imageDiffType={this.props.imageDiffType}
      />
    )
  }

  private renderLargeTextDiff() {
    return (
      <div className="panel empty large-diff">
        <img src={NoDiffImage} className="blankslate-image" />
        <p>
          The diff is too large to be displayed by default.
          <br />
          You can try to show it anyway, but performance may be negatively
          impacted.
        </p>
        <Button onClick={this.showLargeDiff}>Show Diff</Button>
      </div>
    )
  }

  private renderUnrenderableDiff() {
    return (
      <div className="panel empty large-diff">
        <img src={NoDiffImage} />
        <p>The diff is too large to be displayed.</p>
      </div>
    )
  }

  private renderLargeText(diff: ILargeTextDiff) {
    // guaranteed to be set since this function won't be called if text or hunks are null
    const textDiff: ITextDiff = {
      text: diff.text,
      hunks: diff.hunks,
      kind: DiffType.Text,
      lineEndingsChange: diff.lineEndingsChange,
    }

    return this.renderText(textDiff)
  }

  private renderBinaryFile() {
    if (!this.props.file) {
      return null
    }
    return (
      <BinaryFile
        path={this.props.file.path}
        repository={this.props.repository}
        onOpenBinaryFile={this.props.onOpenBinaryFile}
      />
    )
  }

  private renderText(diff: ITextDiffData) {
    if (!this.props.file) {
      return null
    }
    if (diff.hunks.length === 0) {
      if (
        this.props.file.status.kind === AppFileStatusKind.New ||
        this.props.file.status.kind === AppFileStatusKind.Untracked
      ) {
        return <div className="panel empty">The file is empty</div>
      }

      if (this.props.file.status.kind === AppFileStatusKind.Renamed) {
        return (
          <div className="panel renamed">
            The file was renamed but not changed
          </div>
        )
      }

      if (
        isConflictedFileStatus(this.props.file.status) &&
        isManualConflict(this.props.file.status)
      ) {
        return (
          <div className="panel empty">
            The file is in conflict and must be resolved via the command line.
          </div>
        )
      }

      if (this.props.hideWhitespaceInDiff) {
        return <div className="panel empty">Only whitespace changes found</div>
      }

      return <div className="panel empty">No content changes found</div>
    }

    if (
      enableExperimentalDiffViewer() ||
      (enableSideBySideDiffs() && this.props.showSideBySideDiff)
    ) {
      return (
        <SideBySideDiff
          repository={this.props.repository}
          file={this.props.file}
          diff={diff}
          readOnly={this.props.readOnly}
          showSideBySideDiff={this.props.showSideBySideDiff}
          onIncludeChanged={this.props.onIncludeChanged}
          onDiscardChanges={this.props.onDiscardChanges}
          askForConfirmationOnDiscardChanges={
            this.props.askForConfirmationOnDiscardChanges
          }
        />
      )
    }

    return (
      <TextDiff
        repository={this.props.repository}
        file={this.props.file}
        readOnly={this.props.readOnly}
        onIncludeChanged={this.props.onIncludeChanged}
        onDiscardChanges={this.props.onDiscardChanges}
        diff={diff}
        askForConfirmationOnDiscardChanges={
          this.props.askForConfirmationOnDiscardChanges
        }
      />
    )
  }

  private renderSketchDiff(diff: ISketchDiff) {
    if (diff.type === IKactusFileType.Style) {
      return this.renderText(diff)
    }

    let content
    const { file } = this.props
    if (file && file.status.kind === AppFileStatusKind.Conflicted) {
      content = this.renderSketchConflictedDiff(diff)
    } else if (
      file &&
      (file.status.kind === AppFileStatusKind.New ||
        file.status.kind === AppFileStatusKind.Untracked) &&
      diff.isDirectory
    ) {
      content = this.renderNewDirectory()
    } else {
      content = this.renderImage(diff)
    }

    return (
      <div className="sketch-diff-wrapper">
        {this.props.file && this.props.readOnly && this.props.openSketchFile && (
          <div className="sketch-diff-checkbox">
            <Button type="submit" onClick={this.props.openSketchFile}>
              Open Sketch file
            </Button>
          </div>
        )}
        {content}
      </div>
    )
  }

  private renderNewDirectory() {
    return (
      <div className="panel empty">
        This is a new directory that contains too many files to show them all.
        This is probably a new Sketch file. Commit it, the diff will show nicely
        afterwards.
      </div>
    )
  }

  private renderDiff(diff: IDiff): JSX.Element | null {
    switch (diff.kind) {
      case DiffType.Text:
        return this.renderText(diff)
      case DiffType.Binary:
        return this.renderBinaryFile()
      case DiffType.Image:
      case DiffType.VisualText:
        return this.renderImage(diff)
      case DiffType.LargeText: {
        return this.state.forceShowLargeDiff
          ? this.renderLargeText(diff)
          : this.renderLargeTextDiff()
      }
      case DiffType.Sketch:
        return this.renderSketchDiff(diff)
      case DiffType.Unrenderable:
        return this.renderUnrenderableDiff()
      default:
        return assertNever(diff, `Unsupported diff type: ${diff}`)
    }
  }

  private showLargeDiff = () => {
    this.setState({ forceShowLargeDiff: true })
  }

  public render() {
    return (
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexGrow: 1,
          position: 'relative',
        }}
      >
        {this.renderDiff(this.props.diff)}
      </div>
    )
  }
}
