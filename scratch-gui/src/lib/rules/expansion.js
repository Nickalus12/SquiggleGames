import {KIT_COLORS} from '../themes/tokens.js';
import {getKit} from '../kits/registry.js';
import {installRuleMethods, openRulesButton, ruleBlocks, ruleMenus} from './rule-blocks.js';
import {installRulesGuard} from './guard.js';
import {ensureRulesSprite} from './ensure-sprite.js';
import {createDeviceFeed, deviceBlocks, deviceMenus, installDeviceMethods} from '../together2/device-blocks.js';
import log from '../log.js';

const vmOf = runtime => (runtime && runtime.extensionManager && runtime.extensionManager.vm) || null;

const makeExpansion = id => {
    const kit = getKit(id);
    if (!kit || !kit.togetherRequired) throw new Error(`makeExpansion: ${id} is not an expansion`);
    const colors = KIT_COLORS[id];
    class ExpansionBlocks {
        constructor (runtime) {
            this.runtime = runtime;
            installRuleMethods(this, id);
            this._device = createDeviceFeed(runtime, id);
            installDeviceMethods(this, id, () => this._device.game);
            const vm = vmOf(runtime);
            if (vm) installRulesGuard(vm);
        }

        getInfo () {
            return {
                id,
                name: kit.name,
                color1: colors.color1,
                color2: colors.color2,
                color3: colors.color3,
                blocks: [openRulesButton()].concat(deviceBlocks(id), ruleBlocks(id)),
                menus: Object.assign({}, ruleMenus(id), deviceMenus(id))
            };
        }

        openGameRules () {
            const vm = vmOf(this.runtime);
            if (!vm) return Promise.resolve(null);
            return ensureRulesSprite(vm).then(target => {
                vm.setEditingTarget(target.id);
                return target;
            })
                .catch(error => {
                    log.warn('[rules] Game Rules did not open', error && error.message);
                    return null;
                });
        }
    }
    return ExpansionBlocks;
};

export default makeExpansion;
