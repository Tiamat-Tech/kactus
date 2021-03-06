import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import {
  SignInState,
  SignInStep,
  IEndpointEntryState,
  IAuthenticationState,
  ITwoFactorAuthenticationState,
} from '../../lib/stores'
import { Provider } from '../../models/account'
import { assertNever } from '../../lib/fatal-error'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'

import { getWelcomeMessage } from '../../lib/2fa'
import { getDotComAPIEndpoint } from '../../lib/api'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'

interface ISignInProps {
  readonly dispatcher: Dispatcher
  readonly signInState: SignInState | null
  readonly onDismissed: () => void
}

interface ISignInState {
  readonly endpoint: string
  readonly username: string
  readonly password: string
  readonly otpToken: string
  readonly clientId: string
  readonly clientSecret: string
}

const SignInWithBrowserTitle = 'Sign in Using Your Browser'

const DefaultTitle = 'Sign in'

export class SignIn extends React.Component<ISignInProps, ISignInState> {
  public constructor(props: ISignInProps) {
    super(props)

    this.state = {
      endpoint: '',
      username: '',
      password: '',
      otpToken: '',
      clientId: '',
      clientSecret: '',
    }
  }

  public componentWillReceiveProps(nextProps: ISignInProps) {
    if (nextProps.signInState !== this.props.signInState) {
      if (
        nextProps.signInState &&
        nextProps.signInState.kind === SignInStep.Success
      ) {
        this.onDismissed()
      }
    }
  }

  private onSubmit = () => {
    const state = this.props.signInState

    if (!state) {
      return
    }

    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        this.props.dispatcher.setSignInEndpoint(
          Provider.GitHub,
          this.state.endpoint,
          this.state.clientId,
          this.state.clientSecret
        )
        break
      case SignInStep.Authentication:
        if (!state.supportsBasicAuth) {
          this.props.dispatcher.requestBrowserAuthentication()
        } else {
          this.props.dispatcher.setSignInCredentials(
            this.state.username,
            this.state.password
          )
        }
        break
      case SignInStep.TwoFactorAuthentication:
        this.props.dispatcher.setSignInOTP(this.state.otpToken)
        break
      case SignInStep.Success:
        this.onDismissed()
        break
      default:
        assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  private onEndpointChanged = (endpoint: string) => {
    this.setState({ endpoint })
  }

  private onClientIdChanged = (clientId: string) => {
    this.setState({ clientId })
  }

  private onClientSecretChanged = (clientSecret: string) => {
    this.setState({ clientSecret })
  }

  private onUsernameChanged = (username: string) => {
    this.setState({ username })
  }

  private onPasswordChanged = (password: string) => {
    this.setState({ password })
  }

  private onOTPTokenChanged = (otpToken: string) => {
    this.setState({ otpToken })
  }

  private onSignInWithBrowser = () => {
    this.props.dispatcher.requestBrowserAuthentication()
  }

  private renderFooter(): JSX.Element | null {
    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    let disableSubmit = false

    let primaryButtonText: string
    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        disableSubmit =
          this.state.endpoint.length === 0 ||
          this.state.clientId.length === 0 ||
          this.state.clientSecret.length === 0
        primaryButtonText = 'Continue'
        break
      case SignInStep.TwoFactorAuthentication:
        // ensure user has entered non-whitespace characters
        const codeProvided = /\S+/.test(this.state.otpToken)
        disableSubmit = !codeProvided
        primaryButtonText = 'Sign in'
        break
      case SignInStep.Authentication:
        if (!state.supportsBasicAuth) {
          primaryButtonText = 'Continue With Browser'
        } else {
          const validUserName = this.state.username.length > 0
          const validPassword = this.state.password.length > 0
          disableSubmit = !validUserName || !validPassword
          primaryButtonText = 'Sign in'
        }
        break
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
    }

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={primaryButtonText}
          okButtonDisabled={disableSubmit}
        />
      </DialogFooter>
    )
  }

  private renderInstructionForGE(endpoint: string) {
    return (
      <ol>
        <li>
          Login to your{' '}
          {endpoint ? (
            <LinkButton uri={endpoint}>GitHub Enterprise appliance</LinkButton>
          ) : (
            'GitHub Enterprise appliance'
          )}
        </li>
        <li>Click on Settings, OAuth Applications</li>
        <li>
          If there is already a Kactus application, click on it and note Client
          ID, and Client Secret. Otherwise click on Register a new OAuth
          application.
        </li>
        <li>
          <p>Fill in the requested information:</p>
          <ul>
            <li>Application Name: Kactus</li>
            <li>Homepage URL: {'https://kactus.io'}</li>
            <li>Authorization callback URL: {'x-kactus-auth://oauth'}</li>
          </ul>
        </li>
        <li>
          Create the application and take note of the values Client ID, and
          Client Secret.
        </li>
      </ol>
    )
  }

  private renderEndpointEntryStep(state: IEndpointEntryState) {
    return (
      <DialogContent>
        <Row>
          <TextBox
            label="Enterprise address"
            value={this.state.endpoint}
            onValueChanged={this.onEndpointChanged}
            placeholder="https://github.example.com"
          />
        </Row>
        <Row>{this.renderInstructionForGE(this.state.endpoint)}</Row>
        <Row>
          <TextBox
            label="Application Client ID"
            value={this.state.clientId}
            onValueChanged={this.onClientIdChanged}
            placeholder=""
          />
        </Row>
        <Row>
          <TextBox
            label="Application client Secret"
            value={this.state.clientSecret}
            onValueChanged={this.onClientSecretChanged}
            placeholder=""
          />
        </Row>
      </DialogContent>
    )
  }

  private renderAuthenticationStep(state: IAuthenticationState) {
    if (!state.supportsBasicAuth) {
      if (state.endpoint === getDotComAPIEndpoint()) {
        return (
          <DialogContent>
            <p>
              To improve the security of your account, GitHub now requires you
              to sign in through your browser.
            </p>
            <p>
              Your browser will redirect you back to Kactus once you've signed
              in. If your browser asks for your permission to launch Kactus
              please allow it to.
            </p>
          </DialogContent>
        )
      } else {
        return (
          <DialogContent>
            <p>
              Your GitHub Enterprise instance requires you to sign in with your
              browser.
            </p>
          </DialogContent>
        )
      }
    }

    const disableSubmit = state.loading

    return (
      <DialogContent>
        <Row className="sign-in-with-browser">
          <Button
            className="button-with-icon button-component-primary"
            onClick={this.onSignInWithBrowser}
            disabled={disableSubmit}
          >
            Sign in using your browser
            <Octicon symbol={OcticonSymbol.linkExternal} />
          </Button>
        </Row>

        <div className="horizontal-rule">
          <span className="horizontal-rule-content">or</span>
        </div>

        <Row>
          <TextBox
            label="Username or email address"
            value={this.state.username}
            onValueChanged={this.onUsernameChanged}
          />
        </Row>
        <Row>
          <TextBox
            label="Password"
            value={this.state.password}
            type="password"
            onValueChanged={this.onPasswordChanged}
          />
        </Row>
        <Row>
          <LinkButton
            className="forgot-password-link-sign-in"
            uri={state.forgotPasswordUrl}
          >
            Forgot password?
          </LinkButton>
        </Row>
      </DialogContent>
    )
  }

  private renderTwoFactorAuthenticationStep(
    state: ITwoFactorAuthenticationState
  ) {
    return (
      <DialogContent>
        <p>{getWelcomeMessage(state.type)}</p>
        <Row>
          <TextBox
            label="Authentication code"
            value={this.state.otpToken}
            onValueChanged={this.onOTPTokenChanged}
            labelLinkText={`What's this?`}
            labelLinkUri="https://help.github.com/articles/providing-your-2fa-authentication-code/"
            autoFocus={true}
          />
        </Row>
      </DialogContent>
    )
  }

  private renderStep(): JSX.Element | null {
    const state = this.props.signInState

    if (!state) {
      return null
    }

    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        return this.renderEndpointEntryStep(state)
      case SignInStep.Authentication:
        return this.renderAuthenticationStep(state)
      case SignInStep.TwoFactorAuthentication:
        return this.renderTwoFactorAuthenticationStep(state)
      case SignInStep.Success:
        return null
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  public render() {
    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    const disabled = state.loading

    const errors = state.error ? (
      <DialogError>{state.error.message}</DialogError>
    ) : null

    const title =
      this.props.signInState &&
      this.props.signInState.kind === SignInStep.Authentication &&
      !this.props.signInState.supportsBasicAuth
        ? SignInWithBrowserTitle
        : DefaultTitle

    return (
      <Dialog
        id="sign-in"
        title={title}
        disabled={disabled}
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
        loading={state.loading}
      >
        {errors}
        {this.renderStep()}
        {this.renderFooter()}
      </Dialog>
    )
  }

  private onDismissed = () => {
    this.props.dispatcher.resetSignInState()
    this.props.onDismissed()
  }
}
