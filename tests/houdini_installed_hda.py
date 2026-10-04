"""Isolated synthetic proof test of installed HDA; never activates a real account."""
import hou, pathlib, tempfile, json, time, base64, sys
from qatools_licensing import client, houdini_ui
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

assert 'packages/qatools/python3.13libs' in client.__file__.replace('\\','/')
source=r'C:\Users\quima\Documents\houdini22.0\packages\qatools\otls\qafit01_online.hdalc'
hou.hda.installFile(source)
geo=hou.node('/obj').createNode('geo','qatools_test',run_init_scripts=False)
input_node=geo.createNode('python','input_geometry')
input_node.parm('python').set('''geo=hou.pwd().geometry()
geo.addAttrib(hou.attribType.Point,"qa_test",0.0)
for i in range(3):
    point=geo.createPoint()
    point.setPosition((i,0,0))
    point.setAttribValue("qa_test",float(i))
''')
node=geo.createNode('qafit01_online')
node.setInput(0,input_node)
node.parm('Attribute').set('qa_test')
node.parm('Min').set(5)
node.parm('Max').set(10)
assert node.parm('activate_online').parmTemplate().label()=='qatools license key activation'
assert node.parm('machine_limit') is not None
assert all(node.parm(p) is None for p in ('license_key','email','purchase_token','activate_license'))
assert node.node('python1').parm('python').eval().strip()=='hou.pwd().parent().hdaModule().require_license_or_fail()'
private=Ed25519PrivateKey.generate()
public=private.public_key().public_bytes(Encoding.PEM,PublicFormat.SubjectPublicKeyInfo).decode()
now=int(time.time())
def proof(products,issued=now,**identity):
    payload={'vendor':'qatools','version':2,'kind':'license','keyId':'test-only','activationId':'1','credentialId':'00000000-0000-4000-8000-000000000001','machineId':client.get_machine_id(),'products':products,'issuedAt':issued,'expiresAt':issued+30*86400,**identity}
    data=json.dumps(payload,separators=(',',':')).encode()
    enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=').decode()
    return {'payload':enc(data),'signature':enc(private.sign(data))}
with tempfile.TemporaryDirectory() as directory:
    test_client=client.Client(cache_dir=directory,public_keys={'test-only':public},transport=lambda *args: (_ for _ in ()).throw(AssertionError('Cooking must never use network')))
    client._client=test_client
    def cook():
        for target in (node.node('python1'),node):
            try:
                target.cook(force=True)
            except hou.OperationFailed:
                pass
        return node.errors(), node.node('python1').errors()
    missing=cook()
    assert not node.node('python1').isBypassed()
    assert any(missing), 'Unactivated tool must fail'
    test_client._save({'license':proof(['qafit01'])})
    assert not any(cook()), node.errors()
    values=[p.attribValue('qa_test') for p in node.geometry().points()]
    assert values==[5.0,7.5,10.0], values
    test_client._save({'license':proof(['another-tool'])})
    assert any(cook()), 'Unowned tool must fail'
    test_client._save({'license':proof(['qafit01'],now-30*86400-1)})
    assert any(cook()), 'Expired proof must fail'
    test_client._save({'license':proof(['qafit01'])})
    test_client._save({'license':proof(['qafit01'],accountEmail='owner@example.com',activatedAt=now-86400)})
    node.hdaModule()._recook(node)
    assert node.parm('license_state').evalAsString()=='\u2705 active'
    assert node.parm('license_email').evalAsString()=='owner@example.com'
    assert node.parm('license_date').evalAsString()==__import__('datetime').datetime.fromtimestamp(now-86400,__import__('datetime').timezone.utc).strftime('%Y/%m/%d')
    assert node.parm('license_machine').evalAsString()==__import__('platform').node()
    test_client.clear_local_license()
    node.hdaModule()._recook(node)
    assert node.parm('license_state').evalAsString()=='\u274c inactive'
    assert any(cook()), 'Local clear must block actual geometry cooking'
    test_client._save({'license':proof(['qafit01'])})
    calls=[]
    houdini_ui.show_account_dialog=lambda: calls.append('dialog')
    node.parm('activate_online').pressButton()
    assert calls==['dialog']
    assert not node.errors(), node.errors()
    # Verify the primitive branch with independent input geometry.
    input_node.parm('python').set('''geo=hou.pwd().geometry()
geo.addAttrib(hou.attribType.Prim,"qa_test",0.0)
for i in range(3):
    polygon=geo.createPolygon()
    for j in range(3):
        point=geo.createPoint()
        point.setPosition((i,j,0))
        polygon.addVertex(point)
    polygon.setAttribValue("qa_test",float(i))
''')
    node.parm('Class').set(1)
    assert not any(cook()), node.errors()
    primitive_values=[p.attribValue('qa_test') for p in node.geometry().prims()]
    assert primitive_values==[5.0,7.5,10.0], primitive_values
    # A server-signed release denial must block the real SOP guard.
    cached_proof=proof(['qafit01'])
    denial_data=json.dumps({'vendor':'qatools','version':2,'kind':'denial','keyId':'test-only',
        'licenseDigest':client.license_digest(cached_proof),'nonce':'a'*32,'reason':'assignment_inactive','issuedAt':now},separators=(',',':')).encode()
    enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=').decode()
    denial={'payload':enc(denial_data),'signature':enc(private.sign(denial_data))}
    test_client._save({'license':cached_proof,'denial':denial})
    assert any(cook()), 'Verified release must block actual cooking'
    print('PRIMITIVE_AND_RELEASE',json.dumps({'primitiveValues':primitive_values,'signedReleaseBlocksCooking':True}))
    print(json.dumps({'installedClientImport':True,'unchangedGuardInvoked':True,'missingLicenseBlocked':True,'unownedToolBlocked':True,'expiredLicenseBlocked':True,'offlineCookingValues':values,'secretNodeInputsRemoved':True,'actualButtonCallbackRecooksAfterActivation':True}))
