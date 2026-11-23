import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import { ChamberRegisterPage } from './ChamberRegisterPage';

/** Permissions the fake session holds — the wizard is the only page where the gate changes the whole render. */
const granted = new Set<string>();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: (key: string) => granted.has(key) }),
}));

const createChamberApp = vi.fn();
vi.mock('../../data/chamberApi', () => ({
  createChamberApp: (...args: unknown[]) => createChamberApp(...args),
}));

const fetchKubernetesClusters = vi.fn();
const fetchClusterNamespaces = vi.fn();
const fetchClusterServices = vi.fn();
vi.mock('../../data/kubernetesClustersApi', () => ({
  fetchKubernetesClusters: (...args: unknown[]) => fetchKubernetesClusters(...args),
  fetchClusterNamespaces: (...args: unknown[]) => fetchClusterNamespaces(...args),
  fetchClusterServices: (...args: unknown[]) => fetchClusterServices(...args),
}));

const CLUSTER = {
  id: 'c1',
  name: 'mlops-hub',
  description: null,
  default_namespace: 'default',
  api_server: 'https://10.0.0.1:6443',
  kubeconfig_configured: true,
  options: null,
  last_tested_at: null,
  last_test_ok: true,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const SERVICE = {
  name: 'forecast-workbench',
  namespace: 'default',
  type: 'ClusterIP',
  cluster_ip: '10.0.0.9',
  ports: '80/TCP',
  port_numbers: [8000],
  created_at: null,
};

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/chamber/new']}>
      <Routes>
        <Route path="/chamber/new" element={<ChamberRegisterPage />} />
        <Route path="/chamber/:appId" element={<p>run page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  granted.clear();
  granted.add('ontology:write');
  granted.add('console:kubernetes');
  createChamberApp.mockReset();
  createChamberApp.mockResolvedValue({ id: 'app-1' });
  fetchKubernetesClusters.mockReset();
  fetchKubernetesClusters.mockResolvedValue({ items: [CLUSTER] });
  fetchClusterNamespaces.mockReset();
  fetchClusterNamespaces.mockResolvedValue({ items: [{ name: 'default' }] });
  fetchClusterServices.mockReset();
  fetchClusterServices.mockResolvedValue({ namespace: 'default', items: [SERVICE] });
});

describe('ChamberRegisterPage permissions', () => {
  it('names the missing permission instead of showing a form that will fail', () => {
    granted.clear();
    granted.add('ontology:write');
    renderWizard();
    expect(screen.getByText(/console:kubernetes and ontology:write/)).toBeInTheDocument();
    expect(screen.queryByText('Choose a cluster')).not.toBeInTheDocument();
    expect(fetchKubernetesClusters).not.toHaveBeenCalled();
  });
});

describe('ChamberRegisterPage steps', () => {
  it('walks cluster → service → details, prefilling from the Service', async () => {
    renderWizard();

    fireEvent.click(await screen.findByRole('button', { name: /mlops-hub/ }));

    const service = await screen.findByRole('button', { name: /forecast-workbench/ });
    expect(fetchClusterNamespaces).toHaveBeenCalledWith('c1');
    fireEvent.click(service);

    expect(await screen.findByLabelText('Name')).toHaveValue('forecast-workbench');
    expect(screen.getByLabelText('API name')).toHaveValue('forecast_workbench');
    expect(screen.getByLabelText('Port')).toHaveValue(8000);
    expect(screen.getByText(/mlops-hub · default\/forecast-workbench:8000/)).toBeInTheDocument();
  });

  it('registers the binding it showed and opens the app', async () => {
    renderWizard();
    fireEvent.click(await screen.findByRole('button', { name: /mlops-hub/ }));
    fireEvent.click(await screen.findByRole('button', { name: /forecast-workbench/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Register and open' }));

    await waitFor(() => expect(createChamberApp).toHaveBeenCalledTimes(1));
    expect(createChamberApp.mock.calls[0][0]).toMatchObject({
      name: 'forecast-workbench',
      api_name: 'forecast_workbench',
      template_id: 'module',
      bindings: { k8s: { cluster_id: 'c1', namespace: 'default', service: 'forecast-workbench', port: 8000 } },
    });
    // Registering exists to open the app: the journey must not stop on the list.
    expect(await screen.findByText('run page')).toBeInTheDocument();
  });

  it('says the cluster is unreachable instead of showing an empty Service list', async () => {
    fetchClusterNamespaces.mockRejectedValue(new Error('dial tcp 10.0.0.1:6443: i/o timeout'));
    renderWizard();

    fireEvent.click(await screen.findByRole('button', { name: /mlops-hub/ }));

    expect(await screen.findByText(/dial tcp 10.0.0.1:6443: i\/o timeout/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/No Services in this namespace/)).not.toBeInTheDocument();
  });

  it('explains an empty namespace rather than leaving the list blank', async () => {
    fetchClusterServices.mockResolvedValue({ namespace: 'default', items: [] });
    renderWizard();
    fireEvent.click(await screen.findByRole('button', { name: /mlops-hub/ }));

    expect(await screen.findByText(/No Services in this namespace/)).toBeInTheDocument();
    expect(screen.getByText(/not Pods or Deployments/)).toBeInTheDocument();
  });
});

describe('ChamberRegisterPage api_name', () => {
  const reachDetails = async () => {
    renderWizard();
    fireEvent.click(await screen.findByRole('button', { name: /mlops-hub/ }));
    fireEvent.click(await screen.findByRole('button', { name: /forecast-workbench/ }));
    await screen.findByLabelText('API name');
  };

  it('blocks submit for a name the backend would reject', async () => {
    await reachDetails();
    const input = screen.getByLabelText('API name');
    fireEvent.change(input, { target: { value: 'forecast-workbench' } });
    expect(screen.getByRole('button', { name: 'Register and open' })).toBeDisabled();
  });

  it('puts a taken identifier on the field, not in a toast', async () => {
    createChamberApp.mockRejectedValue(new Error('api_name already exists'));
    await reachDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Register and open' }));

    expect(await screen.findByText('That identifier is already used by another app.')).toBeInTheDocument();
    // Nothing the user typed should be lost.
    expect(screen.getByLabelText('Name')).toHaveValue('forecast-workbench');
  });
});
