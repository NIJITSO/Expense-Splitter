const Group = require('../models/Group');
const User = require('../models/User');

const createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const group = await Group.create({
      name,
      description,
      members: [req.user._id],
      createdBy: req.user._id
    });

    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id }).populate('members', 'name email').populate('createdBy', 'name');
    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).populate('members', 'name email').populate('createdBy', 'name');
    if (!group) return res.status(404).json({ message: 'Group not found' });
    
    // Check if user is a member
    if (!group.members.some(member => member._id.equals(req.user._id))) {
      return res.status(403).json({ message: 'Not authorized to view this group' });
    }

    res.status(200).json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addMemberToGroup = async (req, res) => {
  try {
    const { email } = req.body;
    const group = await Group.findById(req.params.id);

    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Check if user is a member or creator
    // (Notice that Mongoose ObjectIds compared with Array.includes won't work perfectly unless stringified, so use exact logic)
    if (!group.members.some(member => member.equals(req.user._id))) {
      return res.status(403).json({ message: 'Not authorized to modify this group' });
    }

    const userToAdd = await User.findOne({ email });
    if (!userToAdd) return res.status(404).json({ message: 'User not found with this email' });

    if (group.members.some(member => member.equals(userToAdd._id))) {
      return res.status(400).json({ message: 'User is already a member of this group' });
    }

    group.members.push(userToAdd._id);
    await group.save();

    res.status(200).json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createGroup, getGroups, getGroupById, addMemberToGroup };
