import * as React from 'react'
import { ModifiedImageDiff } from './modified-image-diff'
import { NewImageDiff } from './new-image-diff'
import { DeletedImageDiff } from './deleted-image-diff'

import { Image, DiffHunk, ImageDiffType } from '../../../models/diff'
import { TextDiff, ITextDiffUtilsProps } from '../text-diff'
import { TabBar, TabBarType } from '../../tab-bar'
import { Loading } from '../../lib/loading'

/** The props for the Diff component. */
interface IDiffProps extends ITextDiffUtilsProps {
  /** The diff that should be rendered */
  readonly previous?: Image | 'loading'
  readonly current?: Image | 'loading'
  readonly text?: string
  readonly hunks?: ReadonlyArray<DiffHunk>

  /** called when changing the type of image diff to display */
  readonly onChangeImageDiffType: (type: ImageDiffType) => void

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType
}

/** A component which renders a diff for a file. */
export class ImageDiff extends React.Component<IDiffProps, {}> {
  private isModified = () => {
    return this.props.current && this.props.previous
  }
  private onChangeDiffType = (index: number) => {
    if (this.isModified()) {
      this.props.onChangeImageDiffType(index)
      return
    }
    this.props.onChangeImageDiffType(
      index === 1 ? ImageDiffType.Text : ImageDiffType.TwoUp
    )
  }

  private renderContent() {
    if (
      this.props.imageDiffType === ImageDiffType.Text &&
      this.props.text &&
      this.props.hunks &&
      this.props.file
    ) {
      return (
        <TextDiff
          repository={this.props.repository}
          readOnly={this.props.readOnly}
          file={this.props.file}
          diff={{
            text: this.props.text,
            hunks: this.props.hunks,
          }}
          onIncludeChanged={this.props.onIncludeChanged}
        />
      )
    }

    if (
      (typeof this.props.previous === 'string' &&
        this.props.previous === 'loading') ||
      (typeof this.props.current === 'string' &&
        this.props.current === 'loading')
    ) {
      return <Loading />
    }

    if (this.props.current && this.props.previous) {
      return (
        <ModifiedImageDiff
          diffType={this.props.imageDiffType}
          current={this.props.current}
          previous={this.props.previous}
        />
      )
    }

    if (this.props.current) {
      return <NewImageDiff current={this.props.current} />
    }

    if (this.props.previous) {
      return <DeletedImageDiff previous={this.props.previous} />
    }

    return null
  }

  public render() {
    const isModified = this.isModified()
    const shouldRenderTabBar = this.props.text || isModified
    let tabs
    if (isModified) {
      tabs = [
        <span key="2-up">2-up</span>,
        <span key="swipe">Swipe</span>,
        <span key="onion">Onion Skin</span>,
        <span key="diff">Difference</span>,
      ]
    } else {
      tabs = [<span key="visual">Visual</span>]
    }
    if (this.props.text) {
      tabs.push(<span key="text">Text</span>)
    }
    return (
      <div className="panel image" id="diff">
        {this.renderContent()}

        {shouldRenderTabBar ? (
          <TabBar
            selectedIndex={
              isModified
                ? this.props.imageDiffType
                : this.props.imageDiffType === ImageDiffType.Text
                ? 1
                : 0
            }
            onTabClicked={this.onChangeDiffType}
            type={TabBarType.Switch}
          >
            {tabs}
          </TabBar>
        ) : null}
      </div>
    )
  }
}
