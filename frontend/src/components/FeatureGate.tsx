import { Navigate } from 'react-router-dom';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';

type FeatureId =
  | 'articles'
  | 'knowledgeBases'
  | 'wikiSpaces'
  | 'objectsAndLinks'
  | 'evaluations'
  | 'knowledge_map';

export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureId;
  children: React.ReactNode;
}) {
  const { toggles } = useFeatureToggles();
  const enabled =
    feature === 'objectsAndLinks'
      ? toggles.objectsAndLinks || !!toggles.hasNeo4jDataSource
      : feature === 'knowledge_map'
        ? toggles.knowledge_map !== false
        : (toggles[feature] ?? false);

  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
