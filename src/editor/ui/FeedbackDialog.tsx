import { DialogFrame } from './Dialog';
import { Icon } from './Controls';

const issues = 'https://github.com/hamzamrtn/logic-electric-circuit-builder/issues/new';

export function FeedbackDialog({ close }: { close: () => void }) {
  return <DialogFrame title="Help shape the next update" description="Missing something? Have an idea or found a problem? Tell me what would make circuit building better for you." close={close}>
    <p className="lec-feedback-response">I review feedback personally. Useful, straightforward improvements can often make it into an update within a day or two; bigger ideas may take longer.</p>
    <div className="lec-feedback-routes">
      <a href={`${issues}?template=idea.yml`} target="_blank" rel="noopener noreferrer"><Icon name="feedback" /><span><strong>Suggest an idea</strong><small>Share what you would like to create or improve.</small></span></a>
      <a href={`${issues}?template=bug-report.yml`} target="_blank" rel="noopener noreferrer"><Icon name="inspect" /><span><strong>Report a problem</strong><small>Describe what happened and what you expected.</small></span></a>
    </div>
    <p>Both routes open GitHub, where you can write as much as you need. A GitHub account is required to submit.</p>
    <footer><button type="button" onClick={close}>Close</button></footer>
  </DialogFrame>;
}
