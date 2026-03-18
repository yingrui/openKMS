import { Navigate } from 'react-router-dom';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';

type FeatureId = 'articles' | 'knowledgeBases' | 'objectsAndLinks';

export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureId;
  children: React.ReactNode;
}) {
  const { toggles } = useFeatureToggles();
  const enabled = toggles[feature];

  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
