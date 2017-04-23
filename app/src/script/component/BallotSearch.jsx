var React = require('react');
var ReactBootstrap = require('react-bootstrap');
var ReactIntl = require('react-intl');
var Reflux = require('reflux');
var classNames = require('classnames');
var Base64 = require('js-base64').Base64;
var jwtDecode = require('jwt-decode');
var dateFormat = require('dateformat');

var Icon = require('./Icon'),
  LoadingIndicator = require('./LoadingIndicator'),
  FileSelectButton = require('../component/FileSelectButton'),
  Title = require('./Title'),
  QRCodeReader = require('../component/QRCodeReader');

var VoteAction = require('../action/VoteAction'),
  BallotAction = require('../action/BallotAction'),
  ProofOfVoteAction = require('../action/ProofOfVoteAction');

var TransactionStore = require('../store/TransactionStore'),
  ProofOfVoteStore = require('../store/ProofOfVoteStore');

var Grid = ReactBootstrap.Grid,
  Col = ReactBootstrap.Col,
  Row = ReactBootstrap.Row,
  Button = ReactBootstrap.Button,
  Pagination = ReactBootstrap.Pagination,
  FormGroup = ReactBootstrap.FormGroup,
  InputGroup = ReactBootstrap.InputGroup,
  FormControl = ReactBootstrap.FormControl,
  DropdownButton = ReactBootstrap.DropdownButton,
  MenuItem = ReactBootstrap.MenuItem,
  ButtonToolbar = ReactBootstrap.ButtonToolbar,
  Modal = ReactBootstrap.Modal,
  Button = ReactBootstrap.Button,
  OverlayTrigger = ReactBootstrap.OverlayTrigger,
  Tooltip = ReactBootstrap.Tooltip;

module.exports = React.createClass({
  mixins: [
    ReactIntl.IntlMixin,
    Reflux.connect(TransactionStore, 'transactions'),
    Reflux.connect(ProofOfVoteStore, 'proofsOfVote'),
    Reflux.listenTo(TransactionStore, 'transactionStoreChangedHandler'),
    Reflux.listenTo(ProofOfVoteStore, 'proofOfVoteStoreChangedHandler'),
  ],

  getInitialState: function() {
    return {
      page: 0,
      searchQuery: '',
      searchMode: 'voter',
      searching: false,
      proofOfVote: '',
      qrCodeReader: false,
    };
  },

  componentWillMount: function() {
    BallotAction.getTransactions(this.props.vote.id, this.state.page);
    VoteAction.showResults(this.props.vote.id);
  },

  transactionStoreChangedHandler: function() {
    this.setState({searching:false});
  },

  proofOfVoteStoreChangedHandler: function() {
    VoteAction.show(this.props.vote.id, true);
  },

  readFromQRCodeHandler: function(data) {
    this.verifyProofOfVote(data);
  },

  readFromFileHandler: function(data) {
    var svg = Base64.decode(data.substr(26));
    var pof = svg.match(/<desc>(.*)<\/desc>/);

    var data = pof[1];

    this.verifyProofOfVote(data);
  },

  verifyProofOfVote(proofOfVote) {
    if (!!proofOfVote) {
      var decoded = jwtDecode(proofOfVote);

      ProofOfVoteAction.verify(proofOfVote);

      this.setState(
        {
          page: 0,
          proofOfVote: proofOfVote,
          searchMode: 'voter',
          searchQuery: '0x' + decoded.a,
        },
        this.search
      );
    }
  },

  resetProofOfVote: function() {
    this.setState(
      {
        proofOfVote: '',
        searchQuery: '',
      },
      this.search
    );
  },

  search: function() {
    if (!!this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }

    var query = this.state.searchQuery;

    // If we're looking for transactions for a specific proposal, the user
    // will type a string but the server expects the proposal ID.
    if (this.state.searchMode === 'proposal') {
      query = this.proposalLabelToID(query);
      if (query < 0) {
        query = '';
      }
    }

    this._searchTimeout = setTimeout(
      () => BallotAction.searchTransactions(
        this.props.vote.id,
        this.state.page,
        {[this.state.searchMode] : query}
      ),
      1000
    );

    this.setState({searching: true});
  },

  componentWillUnmount: function() {
    if (!!this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }
  },

  getColors: function(vote) {
    return !!vote.proposals && !!vote.proposals.length
      ? [
        '#0074D9',
        '#FF851B',
        '#3D9970',
        '#006fa3',
        '#ff550c',
        '#00CE18',
        '#2ECC40',
        '#FFDC00',
        '#B10DC9',
        '#7FDBFF',
        '#F012BE',
        '#39CCCC',
        '#85144B',
      ]
      : [
        '#2ecc71',
        '#bdc3c7',
        '#e74c3c',
      ]
  },

  searchQueryChangeHandler: function(e) {
    this.setState({searchQuery: e.target.value}, this.search);
  },

  searchModeChangeHandler: function(k, e) {
    this.setState({searchMode: k}, this.search);
  },

  renderSearchForm: function() {
    var searchModes = {
      'transactionHash': this.getIntlMessage('ballotBox.TRANSACTION_HASH'),
      'voter' : this.getIntlMessage('ballotBox.VOTER'),
      'ballot' : this.getIntlMessage('ballotBox.BALLOT'),
    };

    const vote = this.props.vote;
    const hasChoices = (!!vote.choices && vote.choices.length !== 0);

    // We don't support searching by ballot value if there are multiple choices
    if (hasChoices) {
      delete searchModes.ballot;
    }

    return (
      <form>
        <FormGroup>
          <InputGroup>
            <FormControl
              type="text"
              value={this.state.searchQuery}
              onChange={this.searchQueryChangeHandler}/>
            <DropdownButton
              componentClass={InputGroup.Button}
              id="input-dropdown-addon"
              title={searchModes[this.state.searchMode]}
              onSelect={this.searchModeChangeHandler}
              pullRight={true}>
              {Object.keys(searchModes).map((mode, index) => {
                return (
                  <MenuItem key={index} eventKey={mode}>{searchModes[mode]}</MenuItem>
                );
              })}
            </DropdownButton>
          </InputGroup>
        </FormGroup>
      </form>
    );
  },

  getVoteValueDisplayMessage: function(id) {
    var vote = this.props.vote;
    var proposals = (!!vote.proposals && vote.proposals.length !== 0)
      ? vote.proposals
      : [
        this.getIntlMessage('vote.VOTE_YES'),
        this.getIntlMessage('vote.VOTE_BLANK'),
        this.getIntlMessage('vote.VOTE_NO'),
      ];

    return proposals[id];
  },

  renderTransactionTable: function() {
    const vote = this.props.vote;
    const hasChoices = (!!vote.choices && vote.choices.length !== 0);
    const colors = this.getColors(vote);
    const transactions = this.state.transactions.getByVoteId(
      vote.id,
      this.state.page
    );

    return (
      <div className="ballot-box-content">
        {this.renderPagination()}
        <table className="table table-hover">
          <thead>
            <tr>
              <th style={{width:45}}/>
              <th>{this.getIntlMessage('ballotBox.TRANSACTION_HASH')}</th>
              <th>{this.getIntlMessage('ballotBox.VOTER')}</th>
              <th>{this.getIntlMessage('ballotBox.BALLOT')}</th>
            </tr>
          </thead>
          <tbody>
            {!!transactions && !transactions.error && transactions.length !== 0 && !this.state.searching
              ? transactions.map((tx) => {
                return (
                  <tr key={tx.transactionHash}>
                    <td style={{width:45}} className="text-center">
                      {'valid' in tx
                        ? <span className={tx.valid ? 'positive' : 'negative'}>
                          <Icon name={tx.valid ? 'checkmark' : 'cross'}/>
                        </span>
                        : null}
                    </td>
                    <td className="truncate">{tx.transactionHash}</td>
                    <td className="truncate">{tx.args.voter}</td>
                    <td className="truncate">
                      {!hasChoices
                        ? <span className={classNames({
                          'label': true,
                        })} style={{
                          backgroundColor: colors[parseInt(tx.args.ballot)],
                        }}>
                          <Title text={this.getVoteValueDisplayMessage(tx.args.ballot)}/>
                        </span>
                        : <div>
                            {tx.args.ballot.map((v, i) => {
                              return (
                                <OverlayTrigger placement="top"
                                  overlay={<Tooltip>
                                    {<Title text={vote.proposals[i]}/>}:&nbsp;
                                    {<Title text={vote.choices[v]}/>}
                                  </Tooltip>}>
                                  <div className="label" style={{
                                    backgroundColor: colors[v],
                                    width: '30px',
                                    paddingTop: '8px',
                                    paddingBottom: '8px',
                                    lineHeight: '14px',
                                    display: 'inline-block',
                                    marginRight: '5px',
                                  }}>
                                    {v}
                                  </div>
                                </OverlayTrigger>
                              );
                            })}
                        </div>}
                    </td>
                  </tr>
                );
              })
              : null}
          </tbody>
        </table>
        {!transactions || !!this.state.searching
          ? <LoadingIndicator/>
          : transactions.length === 0
            ? <p>No ballots.</p>
            : null}
        {this.renderPagination()}
        {this.renderProofOfVoteStatus()}
      </div>
    );
  },

  render: function() {
    var verifying = !!this.state.proofOfVote && (this.state.searching
      || !this.state.proofsOfVote.getVerifiedBallot(this.state.proofOfVote));

    return (
      <Grid>
        {this.renderQRCodeReaderModal()}
        <Row>
          <Col lg={6} md={12}>
            <h2>{this.getIntlMessage('ballotBox.VERIFY_YOUR_BALLOT')}</h2>
            {!this.state.proofOfVote
              ? <ButtonToolbar>
                <Button
                  bsStyle="primary"
                  onClick={(e)=>this.setState({qrCodeReader:true})}>
                  <Icon name="qrcode"/>
                  {this.getIntlMessage('ballotBox.SCAN_MY_PRINTED_PROOF_OF_VOTE')}
                </Button>
                <FileSelectButton onSuccess={this.readFromFileHandler}>
                  <Icon name="cloud_upload"/>
                  {this.getIntlMessage('ballotBox.SELECT_MY_DOWNLOADED_PROOF_OF_VOTE')}
                </FileSelectButton>
              </ButtonToolbar>
              : verifying
                ? <LoadingIndicator text="Verifying..."/>
                : <ButtonToolbar>
                  <Button onClick={this.resetProofOfVote}>
                    {this.getIntlMessage('ballotBox.VERIFY_ANOTHER_PROOF_OF_VOTE')}
                  </Button>
                </ButtonToolbar>}
          </Col>
          <Col lg={6} md={12}>
            <h2>
              {this.getIntlMessage('ballotBox.EXPLORE_THE_BALLOT_BOX')}
            </h2>
            {this.renderSearchForm()}
          </Col>
        </Row>
        <Row>
          <Col xs={12}>
            {this.renderTransactionTable()}
          </Col>
        </Row>
      </Grid>
    );
  },

  selectPageHandler: function(eventKey) {
    if (parseInt(eventKey) - 1 !== this.state.page) {
      this.setState({page: parseInt(eventKey) - 1}, this.search);
    }
  },

  renderPagination: function() {
    var numPages = this.state.transactions.getNumPagesByVoteId(
      this.props.vote.id
    );
    var numItems = this.state.transactions.getNumItemsByVoteId(
      this.props.vote.id
    );
    var transactions = this.state.transactions.getByVoteId(
      this.props.vote.id,
      this.state.page
    );

    if (!!this.state.proofOfVote) {
      return null;
    }

    return (
      <div>
        <Pagination
          prev={true}
          next={true}
          first={true}
          last={true}
          ellipsis={true}
          boundaryLinks={true}
          items={this.state.searching && !!this.state.searchQuery ? 0 : numPages}
          maxButtons={5}
          activePage={this.state.page + 1}
          onSelect={this.selectPageHandler} />
        {!!transactions && !this.state.searching
          ? <div className="pagination-item-count hidden-xs">
            {this.state.page * 10 + 1} - {this.state.page * 10 + transactions.length} / {numItems}
          </div>
          : null}
      </div>
    );
  },

  renderQRCodeReaderModal: function() {
    return (
      <Modal show={this.state.qrCodeReader}>
        <Modal.Body>
          <QRCodeReader onSuccess={this.readFromQRCodeHandler}/>
        </Modal.Body>
        <Modal.Footer>
          <Button
            bsStyle="link"
            onClick={(e)=>this.setState({qrCodeReader:false})}>
            Annuler
          </Button>
        </Modal.Footer>
      </Modal>
    );
  },

  renderProofOfVoteStatus: function() {
    if (this.state.searching || !this.state.proofOfVote) {
      return null;
    }

    var verified = this.state.proofsOfVote.getVerifiedBallot(
      this.state.proofOfVote
    );

    if (!verified) {
      return null;
    }

    return (
      <div className={classNames({
        'ballot-verify-status': true,
        'positive-background': verified.valid,
        'negative-background': !verified.valid,
        'animated': true,
        'flipInX': true,
      })}>
        {verified.valid
          ? <span>
            <Icon name="checkmark"/>
            {this.getIntMessage('ballotBox.VERIFIED')}
          </span>
          : <span>
            <Icon name="cross"/>
            {this.getIntMessage('ballotBox.INVALID')}
          </span>}
        <span className="ballot-verify-date">
          {dateFormat(verified.createdAt, 'UTC:dd-mm-yyyy HH:MM:ss Z')}
        </span>
      </div>
    );
  },
});
