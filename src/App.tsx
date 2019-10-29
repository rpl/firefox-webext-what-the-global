import React from 'react'
import { Grid, Header, Icon, Input, Menu, Modal, Table } from 'semantic-ui-react'
import 'semantic-ui-css/semantic.min.css'

import './App.css';
import {
  fetchDataDump,
  IGlobalsMap,
} from './utils';

const SEARCH_DEBOUNCE_MS = 500;

interface IProps {}

interface ITableSorting {
  direction: "ascending" | "descending",
  column: string,
}

interface IState {
  data: IGlobalsMap | null,
  error: string | null,
  sorting: ITableSorting,
  search: string,
}

class App extends React.Component<IProps, IState> {
  private searchDebounceTimeout: any = null

  constructor(props = {}) {
    super(props);
    this.state = {
      data: null,
      error: null,
      search: "",
      sorting: {
        column: "name",
        direction: "descending",
      },
    };
  }

  componentDidMount() {
    fetchDataDump().then(
      data => {
        console.log("Fetched data:", data);
        this.setState({
          error: null,
          data,
        });
      },
      err => {
        console.error("Fetch error", err);
        this.setState({error: `${err}`});
      }
    );
  }

  handleSort(column: string) {
    return () => {
      const {direction} = this.state.sorting;
      this.setState({
        sorting: {
          column,
          direction: direction === "ascending" ? "descending" : "ascending",
        },
      })
    };
  }

  handleSearchChanged() {
    return  (evt: React.ChangeEvent<HTMLInputElement>) => {
      const search = evt.target.value;
      clearTimeout(this.searchDebounceTimeout);
      this.searchDebounceTimeout = setTimeout(() => {
        this.setState({search});
      }, SEARCH_DEBOUNCE_MS)
    }
  }

  render() {
    return (
      <div className="App">
        <Grid>
          <Grid.Column>
            <Header as='h1'>WTG - What the global!</Header>
            <p>
              A list of all the JS global bindings defined in Firefox WebExtension API modules (the ext-*.js files that provides the APIs implementation code),
              collected by a small JS script using the babel parsing and traverse utilities.
            </p>
            <p>
              Why?
            </p>
            <p>
              All the ext-*.js files are being loaded in a single per-process global, and so it is reasonable to keep a special eye on it.
            </p>
            <p>
              Collitions between globals defined in different ext-*.js files may lead to errors (e.g. the same binding defined as a var and then as a const)
              or unexpected behaviors (e.g. a global function silently override another global function with the same name).
            </p>
            {this.renderMenu()}
            {this.renderTable()}
          </Grid.Column>
        </Grid>
      </div>
    );
  }

  renderMenu() {
    return (
      <Menu>
        <Menu.Item>

        </Menu.Item>
        <Menu.Item position='right'>
          <Input className='icon' icon='search' placeholder='Search...' onChange={this.handleSearchChanged()}/>
        </Menu.Item>
      </Menu>
    );
  }

  renderTable() {
    return (
      <Table sortable celled structured>
        {this.renderTableHeader()}
        {this.renderTableBody()}
      </Table>
    );
  }

  renderTableHeader() {
    const {
      column,
      direction,
    } = this.state.sorting;
    return (
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell
            rowSpan="2"
            sorted={column === "name" ? direction : undefined}
            onClick={this.handleSort('name')}>
            Name
          </Table.HeaderCell>
          <Table.HeaderCell colSpan="5">Where</Table.HeaderCell>
          <Table.HeaderCell rowSpan="2">JS Code</Table.HeaderCell>
          <Table.HeaderCell rowSpan="2">Filename</Table.HeaderCell>
        </Table.Row>
        <Table.Row>
          <Table.HeaderCell>Toolkit</Table.HeaderCell>
          <Table.HeaderCell>Browser</Table.HeaderCell>
          <Table.HeaderCell>Mobile</Table.HeaderCell>
          <Table.HeaderCell>Parent</Table.HeaderCell>
          <Table.HeaderCell>Child</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
    );
  }

  renderTableBody() {
    const {data, sorting, search} = this.state;
    let keys = Reflect.ownKeys(data || {}).sort() as string[];

    if (sorting.column === "name" && sorting.direction === "ascending") {
      keys = keys.reverse();
    }

    return (
      <Table.Body>
        {
          keys.flatMap(key => {
            const els = [];
            let entries = (data && data[key]) || [];
            let idx = 0;

            if (search) {
              // filtering out element based on search field.
              entries = entries.filter(item => {
                if (
                  !key.includes(search) &&
                  !item.filepath.includes(search) &&
                  !item.jscode.includes(search)
                ) {
                  return false;
                }
                return true;
              });
            }

            for (const entry of entries) {
              const {filepath, jscode, metadata} = entry;
              els.push(
                <Table.Row key={key + "-" + idx++}>
                  {
                    idx === 1 &&
                    <Table.Cell rowSpan={entries.length}>
                      <Modal trigger={<span>{key}</span>}>
                        <Modal.Header>{key}</Modal.Header>
                        <Modal.Content>
                          <Modal.Description>
                            {
                              entries.flatMap(item => {
                                return [
                                  <Header>{item.filepath}</Header>,
                                  <pre style={{overflow: "auto"}}>{item.jscode}</pre>
                                ];
                              })
                            }
                          </Modal.Description>
                        </Modal.Content>
                      </Modal>
                    </Table.Cell>
                  }
                  <Table.Cell>
                    {metadata.toolkit && <Icon color='green' name='checkmark' size='small' />}
                  </Table.Cell>
                  <Table.Cell>
                    {metadata.browser && <Icon color='green' name='checkmark' size='small' />}
                  </Table.Cell>
                  <Table.Cell>
                    {metadata.mobile && <Icon color='green' name='checkmark' size='small' />}
                  </Table.Cell>
                  <Table.Cell>
                    {metadata.parent && <Icon color='green' name='checkmark' size='small' />}
                  </Table.Cell>
                  <Table.Cell>
                    {metadata.child && <Icon color='green' name='checkmark' size='small' />}
                  </Table.Cell>
                  <Table.Cell>
                    <Modal trigger={<span>{jscode.slice(0, 50)}{jscode.length > 50 ? "..." : ""}</span>}>
                      <Modal.Header>{key}</Modal.Header>
                      <Modal.Content>
                        <Modal.Description>
                          <Header>{filepath}</Header>
                          <pre style={{overflow: "auto"}}>{jscode}</pre>
                        </Modal.Description>
                      </Modal.Content>
                    </Modal>
                  </Table.Cell>
                  <Table.Cell>{filepath}</Table.Cell>
                </Table.Row>
              );
            }
            return els;
          })
        }
      </Table.Body>
    );
  }
}

export default App
