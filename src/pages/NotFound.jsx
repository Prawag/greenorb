import React from 'react';
import { Link } from 'react-router-dom';
import { useCrumbs } from '../components/Frame.jsx';
import { Empty, Panel } from '../components/ui.jsx';

export default function NotFound() {
  useCrumbs([{ label: 'Page not found' }]);
  return (
    <div className="content">
      <Panel>
        <Empty title="This page doesn’t exist" action={<Link to="/" className="btn btn-primary">Go to overview</Link>}>
          The link may be out of date, or the company or report may have been removed.
        </Empty>
      </Panel>
    </div>
  );
}
