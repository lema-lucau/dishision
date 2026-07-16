import { render } from '@testing-library/react-native';
import { JsonViewer } from '../../debug/JsonViewer';

describe('JsonViewer', () => {
  it('renders a nested payload', async () => {
    const result = await render(
      <JsonViewer data={{ window: 5, pool: 2, survivors: ['a', 'b'] }} />
    );
    expect(result.toJSON()).toMatchSnapshot();
  });

  it('renders primitives without a toggle', async () => {
    const result = await render(<JsonViewer data={42} />);
    expect(result.toJSON()).toMatchSnapshot();
  });
});
